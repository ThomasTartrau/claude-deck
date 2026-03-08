use serde::Serialize;

use claude_deck_core::config::Config;
use claude_deck_core::cost;
use claude_deck_core::tmux::session as tmux_session;

#[derive(Debug, Clone, Serialize)]
pub struct SessionInfo {
    pub name: String,
    pub branch: String,
    pub status: String,
    pub created_at: String,
    pub pane_path: Option<String>,
    pub git_dirty_count: u32,
    pub git_insertions: u32,
    pub git_deletions: u32,
    pub git_ahead: u32,
    pub git_behind: u32,
    pub git_status: String,
    pub tags: Vec<String>,
    pub cost: String,
    pub tokens: String,
    pub age: String,
}

/// Gather all claude-deck sessions from tmux.
pub fn list_sessions() -> Vec<SessionInfo> {
    let core_sessions = tmux_session::list_sessions().unwrap_or_default();
    let config = Config::load();

    let mut sessions = Vec::new();

    for s in &core_sessions {
        // Git status summary
        let git_status = s.git_status_display();

        // Cost info
        let cost_info = s
            .pane_path
            .as_deref()
            .map(cost::parse_cost_from_session)
            .unwrap_or_default();

        // Tags
        let tags = config.tags_for(&s.name);

        sessions.push(SessionInfo {
            name: s.name.clone(),
            branch: s.branch.clone(),
            status: s.status.label().to_string(),
            created_at: s.created_at.to_rfc3339(),
            pane_path: s.pane_path.clone(),
            git_dirty_count: s.git_dirty_count,
            git_insertions: s.git_insertions,
            git_deletions: s.git_deletions,
            git_ahead: s.git_ahead,
            git_behind: s.git_behind,
            git_status,
            tags,
            cost: cost_info.cost_display(),
            tokens: cost_info.tokens_display(),
            age: s.age_display(),
        });
    }

    sessions
}
