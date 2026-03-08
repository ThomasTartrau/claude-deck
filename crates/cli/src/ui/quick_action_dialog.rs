use ratatui::layout::{Constraint, Layout};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Clear, Paragraph, Wrap};
use ratatui::Frame;

use super::utils::centered_rect;
use crate::app::{App, Mode};

pub fn render_list(frame: &mut Frame, app: &App) {
    let area = centered_rect(55, 60, frame.area());
    frame.render_widget(Clear, area);

    let block = Block::bordered()
        .title(" Quick Actions ")
        .style(Style::new().fg(Color::Green));
    let inner = block.inner(area);
    frame.render_widget(block, area);

    let [items_area, hint_area] =
        Layout::vertical([Constraint::Fill(1), Constraint::Length(1)]).areas(inner);

    let actions = &app.config.quick_actions;

    if actions.is_empty() {
        frame.render_widget(
            Paragraph::new(Line::from(Span::styled(
                "No quick actions configured. Press 'n' to add one.",
                Style::new().fg(Color::DarkGray),
            ))),
            items_area,
        );
    } else {
        let visible_count = items_area.height as usize;
        let scroll_offset = if app.qa_cursor >= visible_count {
            app.qa_cursor - visible_count + 1
        } else {
            0
        };

        let lines: Vec<Line> = actions
            .iter()
            .enumerate()
            .skip(scroll_offset)
            .take(visible_count)
            .map(|(i, action)| {
                let is_cursor = i == app.qa_cursor;
                let prefix = if is_cursor { "> " } else { "  " };

                let prefix_style = if is_cursor {
                    Style::new().fg(Color::Yellow).add_modifier(Modifier::BOLD)
                } else {
                    Style::default()
                };

                let key_style = Style::new().fg(Color::Cyan).add_modifier(Modifier::BOLD);

                let label_style = if is_cursor {
                    Style::new()
                        .fg(Color::White)
                        .bg(Color::DarkGray)
                        .add_modifier(Modifier::BOLD)
                } else {
                    Style::new().fg(Color::White)
                };

                let prompt_style = Style::new().fg(Color::DarkGray);

                let prompt_preview: String = if action.prompt.len() > 30 {
                    format!("{}...", &action.prompt[..27])
                } else {
                    action.prompt.clone()
                };

                Line::from(vec![
                    Span::styled(prefix, prefix_style),
                    Span::styled(format!("[{}]", action.key), key_style),
                    Span::styled(format!(" {} ", action.label), label_style),
                    Span::styled(prompt_preview, prompt_style),
                ])
            })
            .collect();

        frame.render_widget(Paragraph::new(lines), items_area);
    }

    frame.render_widget(
        Paragraph::new(Line::from(vec![
            Span::styled(
                "Enter",
                Style::new().fg(Color::Cyan).add_modifier(Modifier::BOLD),
            ),
            Span::styled(":send  ", Style::new().fg(Color::DarkGray)),
            Span::styled(
                "n",
                Style::new().fg(Color::Cyan).add_modifier(Modifier::BOLD),
            ),
            Span::styled(":new  ", Style::new().fg(Color::DarkGray)),
            Span::styled(
                "e",
                Style::new().fg(Color::Cyan).add_modifier(Modifier::BOLD),
            ),
            Span::styled(":edit  ", Style::new().fg(Color::DarkGray)),
            Span::styled(
                "d",
                Style::new().fg(Color::Cyan).add_modifier(Modifier::BOLD),
            ),
            Span::styled(":delete  ", Style::new().fg(Color::DarkGray)),
            Span::styled(
                "Esc",
                Style::new().fg(Color::Cyan).add_modifier(Modifier::BOLD),
            ),
            Span::styled(":close", Style::new().fg(Color::DarkGray)),
        ])),
        hint_area,
    );
}

pub fn render_edit(frame: &mut Frame, app: &App) {
    let area = centered_rect(60, 45, frame.area());
    frame.render_widget(Clear, area);

    let title = if app.mode == Mode::QuickActionEdit {
        " Edit Quick Action "
    } else {
        " New Quick Action "
    };

    let block = Block::bordered()
        .title(title)
        .style(Style::new().fg(Color::Green));
    let inner = block.inner(area);
    frame.render_widget(block, area);

    let [key_label, key_input, label_label, label_input, prompt_label, prompt_input, _spacer, hint_area] =
        Layout::vertical([
            Constraint::Length(1),
            Constraint::Length(1),
            Constraint::Length(1),
            Constraint::Length(1),
            Constraint::Length(1),
            Constraint::Fill(1),
            Constraint::Length(1),
            Constraint::Length(1),
        ])
        .areas(inner);

    let active_style = Style::new().fg(Color::Green).add_modifier(Modifier::BOLD);
    let inactive_style = Style::new().fg(Color::DarkGray);

    // Key field
    let key_label_style = if app.qa_field_focus == 0 {
        active_style
    } else {
        inactive_style
    };
    frame.render_widget(
        Paragraph::new(Span::styled("Shortcut key:", key_label_style)),
        key_label,
    );
    let key_display = if app.qa_field_focus == 0 {
        format!("> {}_", app.qa_key_input)
    } else {
        format!("  {}", app.qa_key_input)
    };
    frame.render_widget(Paragraph::new(key_display), key_input);

    // Label field
    let label_label_style = if app.qa_field_focus == 1 {
        active_style
    } else {
        inactive_style
    };
    frame.render_widget(
        Paragraph::new(Span::styled("Label:", label_label_style)),
        label_label,
    );
    let label_display = if app.qa_field_focus == 1 {
        format!("> {}_", app.qa_label_input)
    } else {
        format!("  {}", app.qa_label_input)
    };
    frame.render_widget(Paragraph::new(label_display), label_input);

    // Prompt field
    let prompt_label_style = if app.qa_field_focus == 2 {
        active_style
    } else {
        inactive_style
    };
    frame.render_widget(
        Paragraph::new(Span::styled("Prompt:", prompt_label_style)),
        prompt_label,
    );
    let prompt_display = if app.qa_field_focus == 2 {
        format!("{}_", app.qa_prompt_input)
    } else {
        app.qa_prompt_input.clone()
    };
    frame.render_widget(
        Paragraph::new(prompt_display).wrap(Wrap { trim: false }),
        prompt_input,
    );

    frame.render_widget(
        Paragraph::new(Line::from(vec![
            Span::styled(
                "Tab",
                Style::new().fg(Color::Cyan).add_modifier(Modifier::BOLD),
            ),
            Span::styled(":next field  ", Style::new().fg(Color::DarkGray)),
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
        hint_area,
    );
}

pub fn render_confirm_delete(frame: &mut Frame, app: &App) {
    let area = centered_rect(45, 20, frame.area());
    frame.render_widget(Clear, area);

    let block = Block::bordered()
        .title(" Delete Quick Action ")
        .style(Style::new().fg(Color::Red));
    let inner = block.inner(area);
    frame.render_widget(block, area);

    let label = app
        .config
        .quick_actions
        .get(app.qa_cursor)
        .map(|a| a.label.as_str())
        .unwrap_or("?");

    let [msg_area, hint_area] =
        Layout::vertical([Constraint::Length(2), Constraint::Length(1)]).areas(inner);

    frame.render_widget(
        Paragraph::new(format!("Delete '{}'?", label))
            .style(Style::new().fg(Color::White).add_modifier(Modifier::BOLD)),
        msg_area,
    );

    frame.render_widget(
        Paragraph::new("y/n").style(Style::new().fg(Color::DarkGray)),
        hint_area,
    );
}
