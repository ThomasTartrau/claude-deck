use ratatui::layout::Rect;
use ratatui::style::{Color, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Paragraph};
use ratatui::Frame;

use crate::app::App;

pub fn render(frame: &mut Frame, app: &App, area: Rect) {
    let max_visible = (area.height.saturating_sub(2)) as usize;
    let entries = &app.action_log;
    let start = entries.len().saturating_sub(max_visible);

    let lines: Vec<Line> = if entries.is_empty() {
        vec![Line::styled(
            "No activity yet",
            Style::new().fg(Color::DarkGray),
        )]
    } else {
        entries
            .iter()
            .skip(start)
            .map(|entry| {
                let ts = entry.time.format("%H:%M:%S").to_string();
                Line::from(vec![
                    Span::styled(format!("[{}] ", ts), Style::new().fg(Color::DarkGray)),
                    Span::styled(&entry.message, Style::new().fg(Color::White)),
                ])
            })
            .collect()
    };

    let block = Block::bordered()
        .title(" Logs ")
        .border_style(Style::new().fg(Color::DarkGray));
    let paragraph = Paragraph::new(lines).block(block);
    frame.render_widget(paragraph, area);
}
