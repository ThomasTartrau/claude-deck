use ratatui::layout::{Constraint, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};

use claude_deck_core::model::session::SessionStatus;

pub fn truncate(s: &str, max: usize) -> String {
    let char_count = s.chars().count();
    if char_count <= max {
        s.to_string()
    } else if max > 3 {
        let truncated: String = s.chars().take(max - 3).collect();
        format!("{}...", truncated)
    } else {
        s.chars().take(max).collect()
    }
}

pub fn centered_rect(percent_x: u16, percent_y: u16, area: Rect) -> Rect {
    let [_, center_v, _] = Layout::vertical([
        Constraint::Percentage((100 - percent_y) / 2),
        Constraint::Percentage(percent_y),
        Constraint::Percentage((100 - percent_y) / 2),
    ])
    .areas(area);

    let [_, center, _] = Layout::horizontal([
        Constraint::Percentage((100 - percent_x) / 2),
        Constraint::Percentage(percent_x),
        Constraint::Percentage((100 - percent_x) / 2),
    ])
    .areas(center_v);

    center
}

pub fn status_icon(status: &SessionStatus) -> &'static str {
    match status {
        SessionStatus::Running => "●",
        SessionStatus::Waiting => "◉",
        SessionStatus::Idle => "○",
        SessionStatus::Dead => "✗",
    }
}

pub fn status_icon_style(status: &SessionStatus, tick: u64) -> Style {
    match status {
        SessionStatus::Running => {
            if (tick / 2).is_multiple_of(2) {
                Style::new().fg(Color::Green).add_modifier(Modifier::BOLD)
            } else {
                Style::new().fg(Color::LightGreen)
            }
        }
        SessionStatus::Waiting => {
            if (tick / 3).is_multiple_of(2) {
                Style::new().fg(Color::Yellow).add_modifier(Modifier::BOLD)
            } else {
                Style::new().fg(Color::LightYellow)
            }
        }
        SessionStatus::Idle => Style::new().fg(Color::DarkGray),
        SessionStatus::Dead => Style::new().fg(Color::Red),
    }
}

pub fn status_text_style(status: &SessionStatus) -> Style {
    match status {
        SessionStatus::Running => Style::new().fg(Color::Green),
        SessionStatus::Waiting => Style::new().fg(Color::Yellow),
        SessionStatus::Idle => Style::new().fg(Color::DarkGray),
        SessionStatus::Dead => Style::new().fg(Color::Red),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncate_short_string_unchanged() {
        assert_eq!(truncate("hello", 10), "hello");
    }

    #[test]
    fn truncate_exact_length() {
        assert_eq!(truncate("hello", 5), "hello");
    }

    #[test]
    fn truncate_long_string_with_ellipsis() {
        assert_eq!(truncate("hello world", 8), "hello...");
    }

    #[test]
    fn truncate_max_3_no_ellipsis() {
        assert_eq!(truncate("hello", 3), "hel");
    }

    #[test]
    fn truncate_max_4_with_ellipsis() {
        assert_eq!(truncate("hello", 4), "h...");
    }

    #[test]
    fn truncate_empty_string() {
        assert_eq!(truncate("", 5), "");
    }

    #[test]
    fn truncate_unicode() {
        assert_eq!(truncate("héllo wörld", 8), "héllo...");
    }

    #[test]
    fn status_icon_returns_correct_symbols() {
        assert_eq!(status_icon(&SessionStatus::Running), "●");
        assert_eq!(status_icon(&SessionStatus::Waiting), "◉");
        assert_eq!(status_icon(&SessionStatus::Idle), "○");
        assert_eq!(status_icon(&SessionStatus::Dead), "✗");
    }

    #[test]
    fn status_icon_style_running_alternates() {
        let style_even = status_icon_style(&SessionStatus::Running, 0);
        let style_odd = status_icon_style(&SessionStatus::Running, 2);
        // At tick 0: (0/2)%2 == 0 → bold green
        // At tick 2: (2/2)%2 == 1 → light green
        assert_ne!(style_even, style_odd);
    }

    #[test]
    fn status_icon_style_idle_is_constant() {
        let s1 = status_icon_style(&SessionStatus::Idle, 0);
        let s2 = status_icon_style(&SessionStatus::Idle, 100);
        assert_eq!(s1, s2);
    }
}
