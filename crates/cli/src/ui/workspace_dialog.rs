use ratatui::layout::{Constraint, Layout};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Clear, Paragraph};
use ratatui::Frame;

use super::utils::centered_rect;
use crate::app::App;

pub fn render_picker(frame: &mut Frame, app: &App) {
    let picker = match app.picker.as_ref() {
        Some(p) => p,
        None => return,
    };

    let area = centered_rect(50, 60, frame.area());
    frame.render_widget(Clear, area);

    let block = Block::bordered()
        .title(" Workspaces ")
        .style(Style::new().fg(Color::Cyan));
    let inner = block.inner(area);
    frame.render_widget(block, area);

    let layout = Layout::vertical([
        Constraint::Fill(1),   // items
        Constraint::Length(1), // hints
    ])
    .split(inner);

    let filtered = picker.filtered_items();
    let counts = app.workspace_session_counts();
    let items_area = layout[0];
    let visible_count = items_area.height as usize;

    let scroll_offset = if picker.cursor >= visible_count {
        picker.cursor - visible_count + 1
    } else {
        0
    };

    let active_name = app.active_workspace_name().unwrap_or("All workspaces");

    let mut lines: Vec<Line> = Vec::new();
    for (i, item) in filtered
        .iter()
        .enumerate()
        .skip(scroll_offset)
        .take(visible_count)
    {
        let is_cursor = i == picker.cursor;
        let is_active = item.as_str() == active_name;

        // Count sessions for this workspace
        let badge = if *item == "All workspaces" {
            let total = app.all_sessions.len();
            format!(" ({})", total)
        } else {
            let ws_idx = app.config.workspaces.iter().position(|w| &w.name == *item);
            match ws_idx {
                Some(idx) if idx < counts.len() => format!(" ({})", counts[idx]),
                _ => String::new(),
            }
        };

        let prefix = if is_cursor { "> " } else { "  " };
        let prefix_style = if is_cursor {
            Style::new().fg(Color::Yellow).add_modifier(Modifier::BOLD)
        } else {
            Style::default()
        };

        let active_marker = if is_active { " *" } else { "" };

        let text_style = if is_cursor {
            Style::new()
                .fg(Color::White)
                .bg(Color::DarkGray)
                .add_modifier(Modifier::BOLD)
        } else if is_active {
            Style::new().fg(Color::Cyan).add_modifier(Modifier::BOLD)
        } else {
            Style::new().fg(Color::White)
        };

        let badge_style = Style::new().fg(Color::DarkGray);
        let active_style = Style::new().fg(Color::Green).add_modifier(Modifier::BOLD);

        lines.push(Line::from(vec![
            Span::styled(prefix, prefix_style),
            Span::styled(item.as_str(), text_style),
            Span::styled(badge, badge_style),
            Span::styled(active_marker, active_style),
        ]));
    }

    frame.render_widget(Paragraph::new(lines), items_area);

    // Hints
    frame.render_widget(
        Paragraph::new(Line::from(vec![
            Span::styled(
                "Enter",
                Style::new().fg(Color::Cyan).add_modifier(Modifier::BOLD),
            ),
            Span::styled(":select  ", Style::new().fg(Color::DarkGray)),
            Span::styled(
                "a",
                Style::new().fg(Color::Cyan).add_modifier(Modifier::BOLD),
            ),
            Span::styled(":add  ", Style::new().fg(Color::DarkGray)),
            Span::styled(
                "d",
                Style::new().fg(Color::Cyan).add_modifier(Modifier::BOLD),
            ),
            Span::styled(":delete  ", Style::new().fg(Color::DarkGray)),
            Span::styled(
                "Esc",
                Style::new().fg(Color::Cyan).add_modifier(Modifier::BOLD),
            ),
            Span::styled(":cancel", Style::new().fg(Color::DarkGray)),
        ])),
        layout[1],
    );
}

pub fn render_add(frame: &mut Frame, app: &App) {
    let area = centered_rect(60, 20, frame.area());
    frame.render_widget(Clear, area);

    let block = Block::bordered()
        .title(" Add Workspace ")
        .style(Style::new().fg(Color::Cyan));
    let inner = block.inner(area);
    frame.render_widget(block, area);

    let [label_area, input_area, hint_area] = Layout::vertical([
        Constraint::Length(1),
        Constraint::Length(1),
        Constraint::Length(1),
    ])
    .areas(inner);

    frame.render_widget(
        Paragraph::new(Line::from(Span::styled(
            "Enter workspace path (~ supported):",
            Style::new().fg(Color::Cyan).add_modifier(Modifier::BOLD),
        ))),
        label_area,
    );

    let max_chars = input_area.width.saturating_sub(4) as usize;
    let char_count = app.workspace_input.chars().count();
    let visible: String = if char_count > max_chars {
        app.workspace_input
            .chars()
            .skip(char_count - max_chars)
            .collect()
    } else {
        app.workspace_input.clone()
    };
    let display = format!("> {}_", visible);
    frame.render_widget(Paragraph::new(display), input_area);

    frame.render_widget(
        Paragraph::new(Line::from(vec![
            Span::styled(
                "Enter",
                Style::new().fg(Color::Cyan).add_modifier(Modifier::BOLD),
            ),
            Span::styled(":add  ", Style::new().fg(Color::DarkGray)),
            Span::styled(
                "Esc",
                Style::new().fg(Color::Cyan).add_modifier(Modifier::BOLD),
            ),
            Span::styled(":back", Style::new().fg(Color::DarkGray)),
        ])),
        hint_area,
    );
}
