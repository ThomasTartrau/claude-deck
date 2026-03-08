use ratatui::layout::Rect;
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Paragraph};
use ratatui::Frame;

use super::utils::{status_icon, status_icon_style, status_text_style, truncate};
use crate::app::App;

pub fn render(frame: &mut Frame, app: &App, area: Rect) {
    // Max value width: area minus borders (2) minus label (9)
    let max_val = area.width.saturating_sub(2 + 9) as usize;

    let content = match app.selected_session() {
        Some(session) => {
            let label_style = Style::new().fg(Color::Yellow).add_modifier(Modifier::BOLD);
            let value_style = Style::new().fg(Color::White);

            let status_symbol = status_icon(&session.status);
            let icon_style = status_icon_style(&session.status, app.tick);
            let text_style = status_text_style(&session.status);

            let git_display = session.git_status_display();
            let git_style = if session.is_git_dirty() {
                Style::new().fg(Color::Yellow)
            } else {
                Style::new().fg(Color::Green)
            };

            let path = session.pane_path.as_deref().unwrap_or("-");

            // Duration tracking
            let (running_dur, waiting_dur) = app
                .session_durations
                .get(&session.name)
                .map(|d| (d.format_running(), d.format_waiting()))
                .unwrap_or_else(|| ("0s".to_string(), "0s".to_string()));

            // Cost tracking
            let (cost_display, tokens_display) = app
                .session_costs
                .get(&session.name)
                .map(|c| (c.cost_display(), c.tokens_display()))
                .unwrap_or_else(|| ("-".to_string(), "-".to_string()));

            let mut lines = vec![
                Line::from(vec![
                    Span::styled("Session  ", label_style),
                    Span::styled(truncate(&session.name, max_val), value_style),
                ]),
                Line::from(vec![
                    Span::styled("Branch   ", label_style),
                    Span::styled(truncate(&session.branch, max_val), value_style),
                ]),
                Line::from(vec![
                    Span::styled("Git      ", label_style),
                    Span::styled(truncate(&git_display, max_val), git_style),
                ]),
                Line::from(vec![
                    Span::styled("Path     ", label_style),
                    Span::styled(truncate(path, max_val), value_style),
                ]),
                Line::from(vec![
                    Span::styled("PID      ", label_style),
                    Span::styled(
                        session
                            .pane_pid
                            .map(|p| p.to_string())
                            .unwrap_or_else(|| "-".to_string()),
                        value_style,
                    ),
                ]),
                Line::from(vec![
                    Span::styled("Status   ", label_style),
                    Span::styled(format!("{} ", status_symbol), icon_style),
                    Span::styled(session.status.label(), text_style),
                ]),
                Line::from(vec![
                    Span::styled("Created  ", label_style),
                    Span::styled(format!("{} ago", session.age_display()), value_style),
                ]),
                Line::from(vec![
                    Span::styled("Running  ", label_style),
                    Span::styled(
                        truncate(&running_dur, max_val),
                        Style::new().fg(Color::Green),
                    ),
                    Span::styled("  Waiting ", label_style),
                    Span::styled(waiting_dur, Style::new().fg(Color::Yellow)),
                ]),
                Line::from(vec![
                    Span::styled("Cost     ", label_style),
                    Span::styled(
                        truncate(&cost_display, max_val),
                        Style::new().fg(Color::Cyan),
                    ),
                ]),
                Line::from(vec![
                    Span::styled("Tokens   ", label_style),
                    Span::styled(
                        truncate(&tokens_display, max_val),
                        Style::new().fg(Color::Cyan),
                    ),
                ]),
            ];

            // Tags line (only if session has tags)
            let tags = app.config.tags_for(&session.name);
            if !tags.is_empty() {
                lines.push(Line::from(vec![
                    Span::styled("Tags     ", label_style),
                    Span::styled(
                        truncate(&tags.join(", "), max_val),
                        Style::new().fg(Color::Magenta),
                    ),
                ]));
            }

            Paragraph::new(lines)
        }
        None => Paragraph::new("No session selected"),
    };

    let block = Block::bordered().title(" Details ");
    frame.render_widget(content.block(block), area);
}
