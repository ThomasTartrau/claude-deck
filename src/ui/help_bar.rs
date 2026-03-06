use ratatui::layout::Rect;
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::Paragraph;
use ratatui::Frame;

use crate::app::{App, Mode};

pub fn render(frame: &mut Frame, app: &App, area: Rect) {
    let bindings: &[(&str, &str)] = match app.mode {
        Mode::Normal => &[
            ("j/k", "nav"),
            ("Enter", "attach"),
            ("n", "new"),
            ("d", "kill"),
            ("R", "rename"),
            ("t", "tag"),
            ("w", "workspace"),
            ("s", "sort"),
            ("c", "resume"),
            ("p", "send"),
            ("y", "copy"),
            ("h/l", "resize"),
            ("D", "diff"),
            ("a", "actions"),
            ("g", "logs"),
            ("/", "filter"),
            ("q", "quit"),
        ],
        Mode::Filter => &[
            ("Type", "filter"),
            ("Enter", "apply"),
            ("Esc", "clear & cancel"),
        ],
        Mode::LaunchDialog => &[("Enter", "launch"), ("Esc", "cancel")],
        Mode::ConfirmKill => &[("y", "confirm"), ("n/Esc", "cancel")],
        Mode::Rename => &[("Type", "name"), ("Enter", "rename"), ("Esc", "cancel")],
        Mode::SendPrompt => &[("Type", "prompt"), ("Enter", "send"), ("Esc", "cancel")],
        Mode::TagPicker => &[("Space", "toggle"), ("Enter", "save"), ("Esc", "cancel")],
        Mode::WorkspacePicker => &[
            ("Enter", "select"),
            ("a", "add"),
            ("d", "delete"),
            ("Esc", "cancel"),
        ],
        Mode::WorkspaceAdd => &[("Type", "path"), ("Enter", "add"), ("Esc", "back")],
        Mode::QuickActionList => &[
            ("j/k", "nav"),
            ("Enter", "send"),
            ("n", "new"),
            ("e", "edit"),
            ("d", "delete"),
            ("Esc", "close"),
        ],
        Mode::QuickActionAdd | Mode::QuickActionEdit => {
            &[("Tab", "next field"), ("Enter", "save"), ("Esc", "cancel")]
        }
        Mode::QuickActionConfirmDelete => &[("y", "confirm"), ("n/Esc", "cancel")],
    };

    let key_style = Style::new().fg(Color::Cyan).add_modifier(Modifier::BOLD);
    let desc_style = Style::new().fg(Color::DarkGray);

    let mut spans: Vec<Span> = Vec::new();
    for (i, (key, desc)) in bindings.iter().enumerate() {
        if i > 0 {
            spans.push(Span::styled("  ", desc_style));
        }
        spans.push(Span::styled(*key, key_style));
        spans.push(Span::styled(format!(":{}", desc), desc_style));
    }

    frame.render_widget(Paragraph::new(Line::from(spans)), area);
}
