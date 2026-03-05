use ratatui::layout::{Constraint, Layout};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Clear, Paragraph};
use ratatui::Frame;

use super::utils::centered_rect;
use crate::app::App;

pub fn render(frame: &mut Frame, app: &App) {
    let picker = match app.picker.as_ref() {
        Some(p) => p,
        None => return,
    };

    let session_name = app
        .selected_session()
        .map(|s| s.name.as_str())
        .unwrap_or("?");

    let area = centered_rect(50, 60, frame.area());
    frame.render_widget(Clear, area);

    let block = Block::bordered()
        .title(format!(" Tags: {} ", session_name))
        .style(Style::new().fg(Color::Magenta));
    let inner = block.inner(area);
    frame.render_widget(block, area);

    let layout = Layout::vertical([
        Constraint::Length(1), // search
        Constraint::Length(1), // selected summary
        Constraint::Fill(1),   // items
        Constraint::Length(1), // hints
    ])
    .split(inner);

    // Search field
    let search_display = if picker.search.is_empty() {
        Line::from(vec![
            Span::styled(
                "/ ",
                Style::new().fg(Color::Yellow).add_modifier(Modifier::BOLD),
            ),
            Span::styled("type to search...", Style::new().fg(Color::DarkGray)),
            Span::styled("_", Style::new().fg(Color::Yellow)),
        ])
    } else {
        Line::from(vec![
            Span::styled(
                "/ ",
                Style::new().fg(Color::Yellow).add_modifier(Modifier::BOLD),
            ),
            Span::styled(
                &picker.search,
                Style::new().fg(Color::White).add_modifier(Modifier::BOLD),
            ),
            Span::styled("_", Style::new().fg(Color::Yellow)),
        ])
    };
    frame.render_widget(Paragraph::new(search_display), layout[0]);

    // Selected tags summary
    let selected_text = if picker.selected.is_empty() {
        Line::from(Span::styled(
            "(none selected)",
            Style::new().fg(Color::DarkGray),
        ))
    } else {
        Line::from(Span::styled(
            picker.selected.join(", "),
            Style::new().fg(Color::Cyan),
        ))
    };
    frame.render_widget(Paragraph::new(selected_text), layout[1]);

    // Items list
    let filtered = picker.filtered_items();
    let items_area = layout[2];
    let visible_count = items_area.height as usize;

    // Scroll so cursor is always visible
    let scroll_offset = if picker.cursor >= visible_count {
        picker.cursor - visible_count + 1
    } else {
        0
    };

    let mut lines: Vec<Line> = Vec::new();
    for (i, item) in filtered
        .iter()
        .enumerate()
        .skip(scroll_offset)
        .take(visible_count)
    {
        let is_cursor = i == picker.cursor;
        let is_selected = picker.is_selected(item);

        let check = if is_selected { "[x] " } else { "[ ] " };
        let check_style = if is_selected {
            Style::new().fg(Color::Green).add_modifier(Modifier::BOLD)
        } else {
            Style::new().fg(Color::DarkGray)
        };

        let text_style = if is_cursor {
            Style::new()
                .fg(Color::White)
                .bg(Color::DarkGray)
                .add_modifier(Modifier::BOLD)
        } else if is_selected {
            Style::new().fg(Color::Green)
        } else {
            Style::new().fg(Color::White)
        };

        let prefix = if is_cursor { "> " } else { "  " };
        let prefix_style = if is_cursor {
            Style::new().fg(Color::Yellow).add_modifier(Modifier::BOLD)
        } else {
            Style::default()
        };

        lines.push(Line::from(vec![
            Span::styled(prefix, prefix_style),
            Span::styled(check, check_style),
            Span::styled(item.as_str(), text_style),
        ]));
    }

    // Show "create new" hint if search doesn't match any existing
    if let Some(new_tag) = picker.new_item_text() {
        if lines.len() < visible_count {
            lines.push(Line::from(vec![
                Span::styled("  ", Style::default()),
                Span::styled(
                    "+ ",
                    Style::new().fg(Color::Green).add_modifier(Modifier::BOLD),
                ),
                Span::styled(
                    format!("Create \"{}\"", new_tag),
                    Style::new().fg(Color::Green),
                ),
            ]));
        }
    }

    frame.render_widget(Paragraph::new(lines), items_area);

    // Hints
    frame.render_widget(
        Paragraph::new(Line::from(vec![
            Span::styled(
                "Space",
                Style::new().fg(Color::Cyan).add_modifier(Modifier::BOLD),
            ),
            Span::styled(":toggle  ", Style::new().fg(Color::DarkGray)),
            Span::styled(
                "Enter",
                Style::new().fg(Color::Cyan).add_modifier(Modifier::BOLD),
            ),
            Span::styled(":save  ", Style::new().fg(Color::DarkGray)),
            Span::styled(
                "Esc",
                Style::new().fg(Color::Cyan).add_modifier(Modifier::BOLD),
            ),
            Span::styled(":cancel", Style::new().fg(Color::DarkGray)),
        ])),
        layout[3],
    );
}
