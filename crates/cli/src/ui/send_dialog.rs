use ratatui::layout::{Constraint, Layout};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Clear, Paragraph, Wrap};
use ratatui::Frame;

use super::utils::centered_rect;
use crate::app::App;

pub fn render(frame: &mut Frame, app: &App) {
    let area = centered_rect(60, 40, frame.area());
    frame.render_widget(Clear, area);

    let session_name = app
        .selected_session()
        .map(|s| s.name.as_str())
        .unwrap_or("?");

    let block = Block::bordered()
        .title(format!(" Send to '{}' ", session_name))
        .style(Style::new().fg(Color::Magenta));
    let inner = block.inner(area);
    frame.render_widget(block, area);

    let [label_area, input_area, hint_area] = Layout::vertical([
        Constraint::Length(1),
        Constraint::Fill(1),
        Constraint::Length(1),
    ])
    .areas(inner);

    frame.render_widget(
        Paragraph::new(Line::from(Span::styled(
            "Prompt:",
            Style::new().fg(Color::Magenta).add_modifier(Modifier::BOLD),
        ))),
        label_area,
    );

    // Build display lines from prompt text
    let display = format!("{}_", app.prompt_text);
    let paragraph = Paragraph::new(display).wrap(Wrap { trim: false });
    frame.render_widget(paragraph, input_area);

    frame.render_widget(
        Paragraph::new(Line::from(vec![
            Span::styled(
                "Enter",
                Style::new().fg(Color::Cyan).add_modifier(Modifier::BOLD),
            ),
            Span::styled(":send  ", Style::new().fg(Color::DarkGray)),
            Span::styled(
                "C-j",
                Style::new().fg(Color::Cyan).add_modifier(Modifier::BOLD),
            ),
            Span::styled(":newline  ", Style::new().fg(Color::DarkGray)),
            Span::styled(
                "Esc",
                Style::new().fg(Color::Cyan).add_modifier(Modifier::BOLD),
            ),
            Span::styled(":cancel", Style::new().fg(Color::DarkGray)),
        ])),
        hint_area,
    );
}
