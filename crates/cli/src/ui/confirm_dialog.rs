use ratatui::layout::{Constraint, Layout};
use ratatui::style::{Color, Modifier, Style};
use ratatui::widgets::{Block, Clear, Paragraph};
use ratatui::Frame;

use super::utils::centered_rect;
use crate::app::App;

pub fn render(frame: &mut Frame, app: &App) {
    let area = centered_rect(40, 20, frame.area());
    frame.render_widget(Clear, area);

    let block = Block::bordered()
        .title(" Confirm Kill ")
        .style(Style::new().fg(Color::Red));
    let inner = block.inner(area);
    frame.render_widget(block, area);

    let session_name = app
        .selected_session()
        .map(|s| s.name.as_str())
        .unwrap_or("?");
    let message = format!("Kill session '{}'?", session_name);

    let [msg_area, hint_area] =
        Layout::vertical([Constraint::Length(2), Constraint::Length(1)]).areas(inner);

    frame.render_widget(
        Paragraph::new(message).style(Style::new().fg(Color::White).add_modifier(Modifier::BOLD)),
        msg_area,
    );

    frame.render_widget(
        Paragraph::new("y/n").style(Style::new().fg(Color::DarkGray)),
        hint_area,
    );
}
