use ratatui::layout::{Constraint, Layout};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Clear, Paragraph};
use ratatui::Frame;

use super::utils::centered_rect;
use crate::app::App;

pub fn render(frame: &mut Frame, app: &App) {
    let area = centered_rect(50, 20, frame.area());
    frame.render_widget(Clear, area);

    let block = Block::bordered()
        .title(" New Session ")
        .style(Style::new().fg(Color::Cyan));
    let inner = block.inner(area);
    frame.render_widget(block, area);

    let [label_area, input_area] =
        Layout::vertical([Constraint::Length(1), Constraint::Length(1)]).areas(inner);

    frame.render_widget(
        Paragraph::new(Line::from(Span::styled(
            "Session name:",
            Style::new().fg(Color::Cyan).add_modifier(Modifier::BOLD),
        ))),
        label_area,
    );

    let max_chars = input_area.width.saturating_sub(4) as usize;
    let char_count = app.launch_name.chars().count();
    let visible: String = if char_count > max_chars {
        app.launch_name
            .chars()
            .skip(char_count - max_chars)
            .collect()
    } else {
        app.launch_name.clone()
    };
    let display = format!("> {}_", visible);
    frame.render_widget(Paragraph::new(display), input_area);
}
