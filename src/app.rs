use std::collections::{HashMap, VecDeque};
use std::time::Instant;

use anyhow::Result;
use chrono::{DateTime, Local};
use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use ratatui::widgets::TableState;

use crate::claude::launcher;
use crate::config::{self, Config, SavedSession};
use crate::cost::{self, CostInfo};
use crate::duration::SessionDurations;
use crate::model::session::{Session, SessionStatus};
use crate::tmux::command::{rename_session, run_tmux_allow_failure, send_keys};
use crate::tmux::session as tmux_session;

const FLASH_DURATION_MS: u128 = 1500;

#[derive(Debug, Clone)]
pub struct LogEntry {
    pub time: DateTime<Local>,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Mode {
    Normal,
    Filter,
    LaunchDialog,
    ConfirmKill,
    SendPrompt,
    Rename,
    TagPicker,
    WorkspacePicker,
    WorkspaceAdd,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum SortBy {
    Name,
    Age,
    Status,
}

impl SortBy {
    pub fn next(self) -> Self {
        match self {
            SortBy::Name => SortBy::Age,
            SortBy::Age => SortBy::Status,
            SortBy::Status => SortBy::Name,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            SortBy::Name => "NAME",
            SortBy::Age => "AGE",
            SortBy::Status => "ST",
        }
    }
}

/// Generic picker state for searchable, multi-select lists.
#[derive(Debug, Clone)]
pub struct PickerState {
    pub search: String,
    pub cursor: usize,
    pub selected: Vec<String>,
    all_items: Vec<String>,
}

impl PickerState {
    pub fn new(items: Vec<String>, selected: Vec<String>) -> Self {
        Self {
            search: String::new(),
            cursor: 0,
            selected,
            all_items: items,
        }
    }

    pub fn filtered_items(&self) -> Vec<&String> {
        let q = self.search.to_lowercase();
        self.all_items
            .iter()
            .filter(|item| q.is_empty() || item.to_lowercase().contains(&q))
            .collect()
    }

    pub fn is_selected(&self, item: &str) -> bool {
        self.selected.iter().any(|s| s == item)
    }

    pub fn toggle_current(&mut self) {
        let filtered = self.filtered_items();
        if let Some(item) = filtered.get(self.cursor) {
            let item = item.to_string();
            if self.is_selected(&item) {
                self.selected.retain(|s| s != &item);
            } else {
                self.selected.push(item);
            }
        }
    }

    pub fn move_up(&mut self) {
        if self.cursor > 0 {
            self.cursor -= 1;
        }
    }

    pub fn move_down(&mut self) {
        let max = self.filtered_items().len().saturating_sub(1);
        if self.cursor < max {
            self.cursor += 1;
        }
    }

    pub fn type_char(&mut self, c: char) {
        self.search.push(c);
        self.cursor = 0;
    }

    pub fn backspace(&mut self) {
        self.search.pop();
        self.cursor = 0;
    }

    /// Returns the search text if it doesn't match any existing item (for creating new).
    pub fn new_item_text(&self) -> Option<String> {
        let trimmed = self.search.trim().to_string();
        if trimmed.is_empty() {
            return None;
        }
        if self
            .all_items
            .iter()
            .any(|i| i.eq_ignore_ascii_case(&trimmed))
        {
            return None;
        }
        Some(trimmed)
    }
}

pub struct App {
    pub config: Config,
    pub all_sessions: Vec<Session>,
    pub sessions: Vec<Session>,
    pub table_state: TableState,
    pub mode: Mode,
    pub should_quit: bool,
    pub should_attach: Option<String>,
    pub launch_name: String,
    pub filter_text: String,
    pub error_message: Option<String>,
    pub flash_message: Option<(String, Instant)>,
    pub tick: u64,
    pub pane_preview: Vec<String>,
    pub preview_scroll: u16,
    preview_session_name: Option<String>,
    pub sort_by: SortBy,
    pub prompt_text: String,
    pub rename_text: String,
    pub tag_filter: Vec<String>,
    pub picker: Option<PickerState>,
    pub workspace_input: String,
    pub active_workspace: Option<usize>,
    pub action_log: VecDeque<LogEntry>,
    pub show_logs: bool,
    pub panel_ratio: u16,
    prev_statuses: HashMap<String, SessionStatus>,
    prev_session_names: Vec<String>,
    pub session_costs: HashMap<String, CostInfo>,
    pub session_durations: HashMap<String, SessionDurations>,
    cost_refresh_counter: u32,
    cost_file_mtimes: HashMap<String, std::time::SystemTime>,
}

impl App {
    pub fn new(config: Config) -> Result<Self> {
        let all_sessions = tmux_session::list_sessions()?;
        let sessions = all_sessions.clone();
        let mut table_state = TableState::default();
        if !sessions.is_empty() {
            table_state.select(Some(0));
        }

        let sort_by = match config.default_sort.as_str() {
            "name" => SortBy::Name,
            "status" => SortBy::Status,
            _ => SortBy::Age,
        };
        let panel_ratio = config.panel_ratio.clamp(20, 80);
        let show_logs = config.show_logs;

        Ok(Self {
            config,
            all_sessions,
            sessions,
            table_state,
            mode: Mode::Normal,
            should_quit: false,
            should_attach: None,
            launch_name: String::new(),
            filter_text: String::new(),
            error_message: None,
            flash_message: None,
            tick: 0,
            pane_preview: Vec::new(),
            preview_scroll: 0,
            preview_session_name: None,
            sort_by,
            prompt_text: String::new(),
            rename_text: String::new(),
            tag_filter: Vec::new(),
            picker: None,
            workspace_input: String::new(),
            active_workspace: None,
            action_log: VecDeque::new(),
            show_logs,
            panel_ratio,
            prev_statuses: HashMap::new(),
            prev_session_names: Vec::new(),
            session_costs: HashMap::new(),
            session_durations: HashMap::new(),
            cost_refresh_counter: 4,
            cost_file_mtimes: HashMap::new(),
        })
    }

    pub fn restore_sessions(&mut self) {
        let saved = config::load_saved_sessions();
        if saved.is_empty() {
            return;
        }

        let live_names: std::collections::HashSet<String> =
            self.all_sessions.iter().map(|s| s.name.clone()).collect();

        let mut restored = 0u32;
        for s in &saved {
            if live_names.contains(&s.name) {
                continue;
            }
            match launcher::resume_claude_session(&s.name, Some(&s.path)) {
                Ok(()) => {
                    self.add_log(&format!("Restored '{}'", s.name));
                    restored += 1;
                }
                Err(e) => {
                    self.add_log(&format!("Failed to restore '{}': {}", s.name, e));
                }
            }
        }

        if restored > 0 {
            self.refresh();
            self.flash_message =
                Some((format!("Restored {} session(s)", restored), Instant::now()));
        }
    }

    pub fn active_workspace_name(&self) -> Option<&str> {
        self.active_workspace
            .and_then(|i| self.config.workspaces.get(i))
            .map(|w| w.name.as_str())
    }

    pub fn active_workspace_path(&self) -> Option<&str> {
        self.active_workspace
            .and_then(|i| self.config.workspaces.get(i))
            .map(|w| w.path.as_str())
    }

    pub fn refresh(&mut self) {
        self.refresh_inner();
    }

    pub fn manual_refresh(&mut self) {
        self.refresh_inner();
        self.flash_message = Some(("Refreshed".to_string(), Instant::now()));
    }

    fn refresh_inner(&mut self) {
        self.all_sessions = tmux_session::list_sessions().unwrap_or_default();

        // Detect Running -> Waiting transitions
        let notifications: Vec<String> = self
            .all_sessions
            .iter()
            .filter_map(|session| {
                let old = self.prev_statuses.get(&session.name)?;
                if *old == SessionStatus::Running && session.status == SessionStatus::Waiting {
                    Some(format!("'{}' finished (Running -> Waiting)", session.name))
                } else {
                    None
                }
            })
            .collect();

        for msg in &notifications {
            self.add_log(msg);
            self.flash_message = Some((msg.clone(), Instant::now()));
        }

        // Send macOS notifications for Running -> Waiting transitions
        if self.config.notifications {
            for msg in &notifications {
                send_notification("Claude Deck", msg);
            }
        }

        self.prev_statuses = self
            .all_sessions
            .iter()
            .map(|s| (s.name.clone(), s.status.clone()))
            .collect();

        // Update duration tracking for each session
        let session_names: Vec<(String, SessionStatus)> = self
            .all_sessions
            .iter()
            .map(|s| (s.name.clone(), s.status.clone()))
            .collect();
        for (name, status) in &session_names {
            self.session_durations
                .entry(name.clone())
                .or_insert_with(SessionDurations::new)
                .update(status);
        }
        // Prune durations for sessions that no longer exist
        let live_names: std::collections::HashSet<&String> =
            session_names.iter().map(|(n, _)| n).collect();
        self.session_durations.retain(|k, _| live_names.contains(k));

        // Parse cost info from Claude session JSONL files (every 5th refresh)
        self.cost_refresh_counter += 1;
        if self.cost_refresh_counter >= 5 {
            self.cost_refresh_counter = 0;
            for s in &self.all_sessions {
                if let Some(ref pane_path) = s.pane_path {
                    if let Some((mtime, file_path)) = cost::session_file_mtime(pane_path) {
                        let cached_mtime = self.cost_file_mtimes.get(&s.name);
                        if cached_mtime.is_some_and(|t| *t == mtime) {
                            continue;
                        }
                        let info = cost::parse_cost_from_file(&file_path);
                        if info.total_tokens() > 0 {
                            self.session_costs.insert(s.name.clone(), info);
                        }
                        self.cost_file_mtimes.insert(s.name.clone(), mtime);
                    }
                }
            }
        }

        // Persist active sessions for restore after reboot (only when list changes)
        let current_names: Vec<String> = self
            .all_sessions
            .iter()
            .filter(|s| s.status != SessionStatus::Dead)
            .map(|s| s.name.clone())
            .collect();
        if current_names != self.prev_session_names {
            self.prev_session_names = current_names;
            let saved: Vec<SavedSession> = self
                .all_sessions
                .iter()
                .filter(|s| s.status != SessionStatus::Dead)
                .filter_map(|s| {
                    Some(SavedSession {
                        name: s.name.clone(),
                        path: s.pane_path.clone()?,
                    })
                })
                .collect();
            config::save_sessions(&saved);
        }

        self.apply_filter();
        self.error_message = None;
        self.update_preview();
    }

    pub fn add_log(&mut self, message: &str) {
        self.action_log.push_back(LogEntry {
            time: Local::now(),
            message: message.to_string(),
        });
        while self.action_log.len() > 500 {
            self.action_log.pop_front();
        }
    }

    fn apply_filter(&mut self) {
        let text_filter = self.filter_text.to_lowercase();
        let tag_filter = self.tag_filter.clone();
        let workspace_path = self.active_workspace_path().map(|p| p.to_string());

        self.sessions = self
            .all_sessions
            .iter()
            .filter(|s| {
                if !text_filter.is_empty() && !s.name.to_lowercase().contains(&text_filter) {
                    return false;
                }
                // Tag filter: session must have ALL selected tags
                if !tag_filter.is_empty() {
                    let session_tags = self.config.tags_for(&s.name);
                    for tag in &tag_filter {
                        if !session_tags.contains(tag) {
                            return false;
                        }
                    }
                }
                // Workspace filter: session path must be under workspace path
                if let Some(ref ws_path) = workspace_path {
                    if let Some(ref pane_path) = s.pane_path {
                        let pp = pane_path.trim_end_matches('/');
                        let wp = ws_path.trim_end_matches('/');
                        if pp != wp && !pp.starts_with(&format!("{}/", wp)) {
                            return false;
                        }
                    } else {
                        return false;
                    }
                }
                true
            })
            .cloned()
            .collect();
        self.apply_sort();
        self.fix_selection();
    }

    fn fix_selection(&mut self) {
        if let Some(selected) = self.table_state.selected() {
            if selected >= self.sessions.len() && !self.sessions.is_empty() {
                self.table_state.select(Some(self.sessions.len() - 1));
            } else if self.sessions.is_empty() {
                self.table_state.select(None);
            }
        } else if !self.sessions.is_empty() {
            self.table_state.select(Some(0));
        }
    }

    fn apply_sort(&mut self) {
        match self.sort_by {
            SortBy::Name => self.sessions.sort_by(|a, b| a.name.cmp(&b.name)),
            SortBy::Age => self
                .sessions
                .sort_by(|a, b| b.created_at.cmp(&a.created_at)),
            SortBy::Status => self.sessions.sort_by(|a, b| {
                fn rank(s: &SessionStatus) -> u8 {
                    match s {
                        SessionStatus::Running => 0,
                        SessionStatus::Waiting => 1,
                        SessionStatus::Idle => 2,
                        SessionStatus::Dead => 3,
                    }
                }
                rank(&a.status).cmp(&rank(&b.status))
            }),
        }
    }

    pub fn update_preview(&mut self) {
        let current_name = self.selected_session().map(|s| s.name.clone());
        self.pane_preview = match self.selected_session() {
            Some(session) => capture_pane_lines(&session.name, 200),
            None => Vec::new(),
        };
        if current_name != self.preview_session_name {
            self.preview_session_name = current_name;
            self.preview_scroll = u16::MAX;
        }
    }

    pub fn scroll_preview(&mut self, delta: i16) {
        let max = (self.pane_preview.len() as u16).saturating_sub(1);
        if delta < 0 {
            self.preview_scroll = self.preview_scroll.saturating_sub((-delta) as u16);
        } else {
            self.preview_scroll = self.preview_scroll.saturating_add(delta as u16).min(max);
        }
    }

    pub fn active_flash(&self) -> Option<&str> {
        self.flash_message.as_ref().and_then(|(msg, at)| {
            if at.elapsed().as_millis() < FLASH_DURATION_MS {
                Some(msg.as_str())
            } else {
                None
            }
        })
    }

    pub fn selected_session(&self) -> Option<&Session> {
        self.table_state
            .selected()
            .and_then(|i| self.sessions.get(i))
    }

    /// Count sessions per workspace (by matching pane_path prefix).
    pub fn workspace_session_counts(&self) -> Vec<usize> {
        self.config
            .workspaces
            .iter()
            .map(|ws| {
                self.all_sessions
                    .iter()
                    .filter(|s| {
                        s.pane_path
                            .as_ref()
                            .map(|p| p.starts_with(&ws.path))
                            .unwrap_or(false)
                    })
                    .count()
            })
            .collect()
    }

    fn rebuild_workspace_picker(&mut self) {
        let items: Vec<String> = std::iter::once("All workspaces".to_string())
            .chain(self.config.workspaces.iter().map(|w| w.name.clone()))
            .collect();
        let current_name = self
            .active_workspace_name()
            .unwrap_or("All workspaces")
            .to_string();
        self.picker = Some(PickerState::new(items, vec![current_name]));
    }

    // ── Key handling ──────────────────────────────────────────────

    pub fn handle_key(&mut self, key: KeyEvent) {
        if key.modifiers.contains(KeyModifiers::CONTROL) && key.code == KeyCode::Char('c') {
            self.should_quit = true;
            return;
        }

        match self.mode {
            Mode::Normal => self.handle_normal_key(key),
            Mode::Filter => self.handle_filter_key(key),
            Mode::LaunchDialog => self.handle_launch_key(key),
            Mode::ConfirmKill => self.handle_confirm_key(key),
            Mode::SendPrompt => self.handle_send_key(key),
            Mode::Rename => self.handle_rename_key(key),
            Mode::TagPicker => self.handle_tag_picker_key(key),
            Mode::WorkspacePicker => self.handle_workspace_picker_key(key),
            Mode::WorkspaceAdd => self.handle_workspace_add_key(key),
        }
    }

    fn handle_normal_key(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Char('q') => self.should_quit = true,
            KeyCode::Char('j') | KeyCode::Down => {
                self.next_session();
                self.update_preview();
            }
            KeyCode::Char('k') | KeyCode::Up => {
                self.prev_session();
                self.update_preview();
            }
            KeyCode::Enter => {
                if let Some(session) = self.selected_session() {
                    let name = session.name.clone();
                    self.add_log(&format!("Attached to '{}'", name));
                    self.should_attach = Some(name);
                }
            }
            KeyCode::Char('n') => {
                self.mode = Mode::LaunchDialog;
                self.launch_name.clear();
            }
            KeyCode::Char('/') => {
                self.mode = Mode::Filter;
            }
            KeyCode::Char('d') => {
                if self.selected_session().is_some() {
                    self.mode = Mode::ConfirmKill;
                }
            }
            KeyCode::Char('s') => {
                self.sort_by = self.sort_by.next();
                self.apply_filter();
                self.flash_message =
                    Some((format!("Sort: {}", self.sort_by.label()), Instant::now()));
            }
            KeyCode::Char('c') => {
                if let Some(session) = self.selected_session() {
                    match session.status {
                        SessionStatus::Dead => {
                            let name = session.name.clone();
                            let repo = session.pane_path.clone();
                            match launcher::resume_claude_session(&name, repo.as_deref()) {
                                Ok(()) => {
                                    self.add_log(&format!("Resumed '{}'", name));
                                    self.flash_message =
                                        Some(("Resumed".to_string(), Instant::now()));
                                    self.refresh();
                                }
                                Err(e) => {
                                    self.error_message = Some(format!("Resume failed: {}", e));
                                }
                            }
                        }
                        _ => {
                            self.flash_message = Some((
                                "Only Dead sessions can be resumed".to_string(),
                                Instant::now(),
                            ));
                        }
                    }
                }
            }
            KeyCode::Char('p') => {
                if let Some(session) = self.selected_session() {
                    match session.status {
                        SessionStatus::Running | SessionStatus::Waiting => {
                            self.mode = Mode::SendPrompt;
                            self.prompt_text.clear();
                        }
                        _ => {
                            self.flash_message = Some((
                                "Only Running/Waiting sessions accept prompts".to_string(),
                                Instant::now(),
                            ));
                        }
                    }
                }
            }
            KeyCode::Char('r') => self.manual_refresh(),
            KeyCode::Char('R') => {
                if let Some(session) = self.selected_session() {
                    self.rename_text = session.name.clone();
                    self.mode = Mode::Rename;
                }
            }
            KeyCode::Char('y') => {
                self.copy_preview_to_clipboard();
            }
            KeyCode::Char('h') | KeyCode::Left => {
                self.panel_ratio = self.panel_ratio.saturating_sub(5).max(20);
            }
            KeyCode::Char('l') | KeyCode::Right => {
                self.panel_ratio = (self.panel_ratio + 5).min(80);
            }
            KeyCode::Char('g') => {
                self.show_logs = !self.show_logs;
            }
            KeyCode::Char('t') => {
                if let Some(session) = self.selected_session() {
                    let all_tags = self.config.all_tags();
                    let current = self.config.tags_for(&session.name);
                    self.picker = Some(PickerState::new(all_tags, current));
                    self.mode = Mode::TagPicker;
                }
            }
            KeyCode::Char('w') => {
                self.rebuild_workspace_picker();
                self.mode = Mode::WorkspacePicker;
            }
            _ => {}
        }
    }

    fn handle_filter_key(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Esc => {
                self.filter_text.clear();
                self.apply_filter();
                self.update_preview();
                self.mode = Mode::Normal;
            }
            KeyCode::Enter => {
                self.mode = Mode::Normal;
            }
            KeyCode::Char(c) => {
                self.filter_text.push(c);
                self.apply_filter();
                self.update_preview();
            }
            KeyCode::Backspace => {
                self.filter_text.pop();
                self.apply_filter();
                self.update_preview();
            }
            _ => {}
        }
    }

    fn handle_launch_key(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Esc => self.mode = Mode::Normal,
            KeyCode::Enter => {
                let name = if self.launch_name.trim().is_empty() {
                    generate_session_name()
                } else {
                    self.launch_name.trim().to_string()
                };
                let repo = self.active_workspace_path().map(|s| s.to_string());
                match launcher::launch_claude_session(&name, None, repo.as_deref()) {
                    Ok(()) => {
                        self.add_log(&format!("Launched '{}'", name));
                        self.flash_message = Some(("Launched".to_string(), Instant::now()));
                        self.mode = Mode::Normal;
                        self.refresh();
                    }
                    Err(e) => {
                        self.error_message = Some(format!("Launch failed: {}", e));
                        self.mode = Mode::Normal;
                    }
                }
            }
            KeyCode::Char(c) => self.launch_name.push(c),
            KeyCode::Backspace => {
                self.launch_name.pop();
            }
            _ => {}
        }
    }

    fn handle_confirm_key(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Char('y') | KeyCode::Char('Y') => {
                if let Some(session) = self.selected_session() {
                    let name = session.name.clone();
                    match tmux_session::kill_session(&name) {
                        Ok(()) => {
                            self.add_log(&format!("Killed '{}'", name));
                            self.mode = Mode::Normal;
                            self.refresh();
                        }
                        Err(e) => {
                            self.error_message = Some(format!("Kill failed: {}", e));
                            self.mode = Mode::Normal;
                        }
                    }
                }
            }
            KeyCode::Char('n') | KeyCode::Char('N') | KeyCode::Esc => {
                self.mode = Mode::Normal;
            }
            _ => {}
        }
    }

    fn handle_send_key(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Esc => {
                self.prompt_text.clear();
                self.mode = Mode::Normal;
            }
            KeyCode::Char('j') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                self.prompt_text.push('\n');
            }
            KeyCode::Enter => {
                if !self.prompt_text.is_empty() {
                    if let Some(session) = self.selected_session() {
                        let name = session.name.clone();
                        let text = self.prompt_text.clone();
                        match send_keys(&name, &text) {
                            Ok(()) => {
                                self.add_log(&format!("Sent prompt to '{}'", name));
                                self.flash_message =
                                    Some(("Prompt sent".to_string(), Instant::now()));
                            }
                            Err(e) => {
                                self.error_message = Some(format!("Send failed: {}", e));
                            }
                        }
                    }
                    self.prompt_text.clear();
                    self.mode = Mode::Normal;
                }
            }
            KeyCode::Char(c) => self.prompt_text.push(c),
            KeyCode::Backspace => {
                self.prompt_text.pop();
            }
            _ => {}
        }
    }

    fn handle_rename_key(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Esc => {
                self.rename_text.clear();
                self.mode = Mode::Normal;
            }
            KeyCode::Enter => {
                if !self.rename_text.is_empty() {
                    if let Some(session) = self.selected_session() {
                        let old_name = session.name.clone();
                        let new_name = self.rename_text.trim().to_string();
                        if old_name != new_name {
                            match rename_session(&old_name, &new_name) {
                                Ok(()) => {
                                    self.add_log(&format!(
                                        "Renamed '{}' -> '{}'",
                                        old_name, new_name
                                    ));
                                    self.flash_message =
                                        Some(("Renamed".to_string(), Instant::now()));
                                    self.refresh();
                                }
                                Err(e) => {
                                    self.error_message = Some(format!("Rename failed: {}", e));
                                }
                            }
                        }
                    }
                }
                self.rename_text.clear();
                self.mode = Mode::Normal;
            }
            KeyCode::Char(c) => self.rename_text.push(c),
            KeyCode::Backspace => {
                self.rename_text.pop();
            }
            _ => {}
        }
    }

    fn handle_tag_picker_key(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Esc => {
                self.picker = None;
                self.mode = Mode::Normal;
            }
            KeyCode::Enter => {
                // Save tags: apply picker selection to session
                if let (Some(picker), Some(session)) = (self.picker.take(), self.selected_session())
                {
                    let name = session.name.clone();
                    let mut new_tags = picker.selected.clone();
                    // If user typed a new tag name, create it
                    if let Some(new_tag) = picker.new_item_text() {
                        if !new_tags.contains(&new_tag) {
                            new_tags.push(new_tag);
                        }
                    }
                    self.config.set_tags(&name, new_tags.clone());
                    self.config.save();
                    let label = if new_tags.is_empty() {
                        "Tags cleared".to_string()
                    } else {
                        format!("Tags: {}", new_tags.join(", "))
                    };
                    self.add_log(&format!("Updated tags for '{}': {}", name, label));
                    self.flash_message = Some((label, Instant::now()));
                }
                self.mode = Mode::Normal;
            }
            KeyCode::Char(' ') => {
                if let Some(ref mut picker) = self.picker {
                    picker.toggle_current();
                }
            }
            KeyCode::Up => {
                if let Some(ref mut picker) = self.picker {
                    picker.move_up();
                }
            }
            KeyCode::Down => {
                if let Some(ref mut picker) = self.picker {
                    picker.move_down();
                }
            }
            KeyCode::Char(c) => {
                if let Some(ref mut picker) = self.picker {
                    picker.type_char(c);
                }
            }
            KeyCode::Backspace => {
                if let Some(ref mut picker) = self.picker {
                    picker.backspace();
                }
            }
            _ => {}
        }
    }

    fn handle_workspace_picker_key(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Esc => {
                self.picker = None;
                self.mode = Mode::Normal;
            }
            KeyCode::Enter => {
                // Select workspace
                if let Some(ref picker) = self.picker {
                    let filtered = picker.filtered_items();
                    if let Some(selected) = filtered.get(picker.cursor) {
                        if *selected == "All workspaces" {
                            self.active_workspace = None;
                            self.flash_message =
                                Some(("All workspaces".to_string(), Instant::now()));
                        } else {
                            let idx = self
                                .config
                                .workspaces
                                .iter()
                                .position(|w| &w.name == *selected);
                            self.active_workspace = idx;
                            self.flash_message =
                                Some((format!("Workspace: {}", selected), Instant::now()));
                        }
                        self.apply_filter();
                        self.update_preview();
                    }
                }
                self.picker = None;
                self.mode = Mode::Normal;
            }
            KeyCode::Char('a')
                if key.modifiers.is_empty()
                    && self.picker.as_ref().is_none_or(|p| p.search.is_empty()) =>
            {
                // Add workspace
                self.workspace_input.clear();
                self.mode = Mode::WorkspaceAdd;
            }
            KeyCode::Char('d') if self.picker.as_ref().is_none_or(|p| p.search.is_empty()) => {
                // Delete workspace under cursor
                if let Some(ref picker) = self.picker {
                    let filtered = picker.filtered_items();
                    if let Some(selected) = filtered.get(picker.cursor) {
                        if *selected != "All workspaces" {
                            let idx = self
                                .config
                                .workspaces
                                .iter()
                                .position(|w| &w.name == *selected);
                            if let Some(idx) = idx {
                                let name = self.config.workspaces[idx].name.clone();
                                self.config.remove_workspace(idx);
                                self.config.save();
                                if self.active_workspace == Some(idx) {
                                    self.active_workspace = None;
                                } else if self.active_workspace.is_some_and(|a| a > idx) {
                                    self.active_workspace = self.active_workspace.map(|a| a - 1);
                                }
                                self.add_log(&format!("Removed workspace '{}'", name));
                                self.rebuild_workspace_picker();
                            }
                        }
                    }
                }
            }
            KeyCode::Up => {
                if let Some(ref mut picker) = self.picker {
                    picker.move_up();
                }
            }
            KeyCode::Down => {
                if let Some(ref mut picker) = self.picker {
                    picker.move_down();
                }
            }
            KeyCode::Char(c) => {
                if let Some(ref mut picker) = self.picker {
                    picker.type_char(c);
                }
            }
            KeyCode::Backspace => {
                if let Some(ref mut picker) = self.picker {
                    picker.backspace();
                }
            }
            _ => {}
        }
    }

    fn handle_workspace_add_key(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Esc => {
                self.workspace_input.clear();
                self.rebuild_workspace_picker();
                self.mode = Mode::WorkspacePicker;
            }
            KeyCode::Enter => {
                let path = self.workspace_input.trim().to_string();
                if !path.is_empty() {
                    // Resolve ~ and canonicalize
                    let expanded = if path.starts_with('~') {
                        dirs::home_dir()
                            .map(|h| path.replacen('~', &h.to_string_lossy(), 1))
                            .unwrap_or(path.clone())
                    } else {
                        path.clone()
                    };

                    let canonical = std::fs::canonicalize(&expanded)
                        .map(|p| p.to_string_lossy().to_string())
                        .unwrap_or(expanded);

                    if !std::path::Path::new(&canonical).is_dir() {
                        self.error_message = Some(format!("Not a directory: {}", canonical));
                        self.workspace_input.clear();
                        self.rebuild_workspace_picker();
                        self.mode = Mode::WorkspacePicker;
                        return;
                    }

                    // Derive name from last path component
                    let name = std::path::Path::new(&canonical)
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| canonical.clone());

                    self.config.add_workspace(name.clone(), canonical);
                    self.config.save();
                    self.add_log(&format!("Added workspace '{}'", name));
                    self.flash_message = Some((format!("+{}", name), Instant::now()));
                }
                self.workspace_input.clear();
                self.rebuild_workspace_picker();
                self.mode = Mode::WorkspacePicker;
            }
            KeyCode::Char(c) => self.workspace_input.push(c),
            KeyCode::Backspace => {
                self.workspace_input.pop();
            }
            _ => {}
        }
    }

    fn copy_preview_to_clipboard(&mut self) {
        if self.pane_preview.is_empty() {
            self.flash_message = Some(("Nothing to copy".to_string(), Instant::now()));
            return;
        }
        let content: String = self
            .pane_preview
            .iter()
            .map(|line| strip_ansi(line))
            .collect::<Vec<_>>()
            .join("\n");
        let result = clipboard_copy(&content);
        match result {
            Ok(status) if status.success() => {
                self.add_log("Copied preview to clipboard");
                self.flash_message = Some(("Copied!".to_string(), Instant::now()));
            }
            _ => {
                self.error_message = Some("Copy failed".to_string());
            }
        }
    }

    fn next_session(&mut self) {
        if self.sessions.is_empty() {
            return;
        }
        let i = match self.table_state.selected() {
            Some(i) => (i + 1) % self.sessions.len(),
            None => 0,
        };
        self.table_state.select(Some(i));
    }

    fn prev_session(&mut self) {
        if self.sessions.is_empty() {
            return;
        }
        let i = match self.table_state.selected() {
            Some(i) => {
                if i == 0 {
                    self.sessions.len() - 1
                } else {
                    i - 1
                }
            }
            None => 0,
        };
        self.table_state.select(Some(i));
    }
}

fn generate_session_name() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros();
    format!("s-{:x}", ts % 0xFFFFFF)
}

fn strip_ansi(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            match chars.peek() {
                Some(&'[') => {
                    chars.next();
                    while let Some(&next) = chars.peek() {
                        chars.next();
                        if next.is_ascii_alphabetic() {
                            break;
                        }
                    }
                }
                Some(&']') => {
                    chars.next();
                    while let Some(next) = chars.next() {
                        if next == '\x07' {
                            break;
                        }
                        if next == '\x1b' && chars.peek() == Some(&'\\') {
                            chars.next();
                            break;
                        }
                    }
                }
                Some(&c2) if c2.is_ascii_alphabetic() || c2 == '(' || c2 == ')' || c2 == '#' => {
                    chars.next();
                }
                _ => {}
            }
        } else {
            result.push(c);
        }
    }
    result
}

fn clipboard_copy(text: &str) -> std::io::Result<std::process::ExitStatus> {
    let candidates = if cfg!(target_os = "macos") {
        vec![("pbcopy", vec![])]
    } else {
        vec![
            ("xclip", vec!["-selection", "clipboard"]),
            ("xsel", vec!["--clipboard", "--input"]),
        ]
    };

    for (cmd, args) in &candidates {
        if let Ok(mut child) = std::process::Command::new(cmd)
            .args(args)
            .stdin(std::process::Stdio::piped())
            .spawn()
        {
            use std::io::Write;
            if let Some(ref mut stdin) = child.stdin {
                stdin.write_all(text.as_bytes())?;
            }
            return child.wait();
        }
    }

    Err(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        "no clipboard command found",
    ))
}

fn send_notification(title: &str, message: &str) {
    let script = format!(
        "display notification \"{}\" with title \"{}\" sound name \"Glass\"",
        message.replace('\\', "\\\\").replace('"', "\\\""),
        title.replace('\\', "\\\\").replace('"', "\\\""),
    );
    let _ = std::process::Command::new("osascript")
        .args(["-e", &script])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn();
}

fn capture_pane_lines(session_name: &str, max_lines: usize) -> Vec<String> {
    run_tmux_allow_failure(&["capture-pane", "-t", session_name, "-p", "-e", "-S", "-"])
        .map(|content| {
            let lines: Vec<String> = content.lines().map(|l| l.to_string()).collect();
            let non_empty: Vec<String> = lines
                .into_iter()
                .rev()
                .filter(|l| !l.trim().is_empty())
                .take(max_lines)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect();
            non_empty
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_ansi_plain_text_unchanged() {
        assert_eq!(strip_ansi("hello world"), "hello world");
    }

    #[test]
    fn strip_ansi_removes_color_codes() {
        assert_eq!(strip_ansi("\x1b[31mred\x1b[0m text"), "red text");
    }

    #[test]
    fn strip_ansi_removes_256_color() {
        assert_eq!(strip_ansi("\x1b[38;5;100mcolored\x1b[0m"), "colored");
    }

    #[test]
    fn strip_ansi_removes_rgb_color() {
        assert_eq!(strip_ansi("\x1b[38;2;255;0;128mrgb\x1b[0m"), "rgb");
    }

    #[test]
    fn strip_ansi_removes_osc_sequences() {
        assert_eq!(strip_ansi("\x1b]0;title\x07text"), "text");
    }

    #[test]
    fn strip_ansi_removes_osc_with_st() {
        assert_eq!(strip_ansi("\x1b]0;title\x1b\\text"), "text");
    }

    #[test]
    fn strip_ansi_empty_string() {
        assert_eq!(strip_ansi(""), "");
    }

    #[test]
    fn strip_ansi_mixed_content() {
        assert_eq!(
            strip_ansi("normal \x1b[1;32mbold green\x1b[0m end"),
            "normal bold green end"
        );
    }

    #[test]
    fn generate_session_name_has_prefix() {
        let name = generate_session_name();
        assert!(name.starts_with("s-"));
    }

    #[test]
    fn generate_session_name_is_hex() {
        let name = generate_session_name();
        let hex_part = &name[2..];
        assert!(hex_part.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn picker_state_filter_by_search() {
        let picker = PickerState::new(vec!["alpha".into(), "beta".into(), "gamma".into()], vec![]);
        assert_eq!(picker.filtered_items().len(), 3);

        let mut picker = picker;
        picker.type_char('a');
        let filtered = picker.filtered_items();
        // "a" matches alpha, beta (contains 'a'), gamma (contains 'a')
        assert_eq!(filtered.len(), 3);

        picker.type_char('l');
        let filtered = picker.filtered_items();
        // "al" matches only alpha
        assert_eq!(filtered.len(), 1);
        assert_eq!(*filtered[0], "alpha");
    }

    #[test]
    fn picker_state_toggle_selection() {
        let mut picker = PickerState::new(vec!["a".into(), "b".into(), "c".into()], vec![]);
        picker.toggle_current(); // selects "a"
        assert!(picker.is_selected("a"));
        picker.toggle_current(); // deselects "a"
        assert!(!picker.is_selected("a"));
    }

    #[test]
    fn picker_state_move_up_at_zero_stays() {
        let mut picker = PickerState::new(vec!["a".into(), "b".into()], vec![]);
        assert_eq!(picker.cursor, 0);
        picker.move_up();
        assert_eq!(picker.cursor, 0);
    }

    #[test]
    fn picker_state_move_down_clamps() {
        let mut picker = PickerState::new(vec!["a".into(), "b".into()], vec![]);
        picker.move_down();
        assert_eq!(picker.cursor, 1);
        picker.move_down();
        assert_eq!(picker.cursor, 1); // clamped
    }

    #[test]
    fn picker_state_new_item_text_none_when_exists() {
        let mut picker = PickerState::new(vec!["existing".into()], vec![]);
        picker.search = "existing".into();
        assert!(picker.new_item_text().is_none());
    }

    #[test]
    fn picker_state_new_item_text_case_insensitive() {
        let mut picker = PickerState::new(vec!["Existing".into()], vec![]);
        picker.search = "existing".into();
        assert!(picker.new_item_text().is_none());
    }

    #[test]
    fn picker_state_new_item_text_returns_trimmed() {
        let mut picker = PickerState::new(vec!["a".into()], vec![]);
        picker.search = "  new-tag  ".into();
        assert_eq!(picker.new_item_text(), Some("new-tag".into()));
    }

    #[test]
    fn picker_state_new_item_text_none_when_empty() {
        let mut picker = PickerState::new(vec!["a".into()], vec![]);
        picker.search = "   ".into();
        assert!(picker.new_item_text().is_none());
    }

    #[test]
    fn picker_state_backspace_resets_cursor() {
        let mut picker = PickerState::new(vec!["alpha".into(), "beta".into()], vec![]);
        picker.type_char('a');
        picker.move_down();
        picker.backspace();
        assert_eq!(picker.cursor, 0);
        assert_eq!(picker.search, "");
    }

    #[test]
    fn sort_by_cycles() {
        assert_eq!(SortBy::Name.next(), SortBy::Age);
        assert_eq!(SortBy::Age.next(), SortBy::Status);
        assert_eq!(SortBy::Status.next(), SortBy::Name);
    }

    #[test]
    fn sort_by_labels() {
        assert_eq!(SortBy::Name.label(), "NAME");
        assert_eq!(SortBy::Age.label(), "AGE");
        assert_eq!(SortBy::Status.label(), "ST");
    }
}
