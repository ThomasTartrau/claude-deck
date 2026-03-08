mod confirm_dialog;
mod detail_panel;
mod help_bar;
mod launch_dialog;
mod logs_panel;
mod picker_dialog;
mod preview_panel;
mod quick_action_dialog;
mod rename_dialog;
mod send_dialog;
mod sessions_table;
mod utils;
mod workspace_dialog;

use ratatui::layout::{Alignment, Constraint, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Clear, Paragraph};
use ratatui::Frame;

use crate::app::{App, Mode};

pub fn render(frame: &mut Frame, app: &mut App) {
    let show_filter_bar = app.mode == Mode::Filter || !app.filter_text.is_empty();

    let layout = if show_filter_bar {
        Layout::vertical([
            Constraint::Length(3),
            Constraint::Length(3),
            Constraint::Fill(1),
            Constraint::Length(1),
        ])
        .split(frame.area())
    } else {
        Layout::vertical([
            Constraint::Length(3),
            Constraint::Length(0),
            Constraint::Fill(1),
            Constraint::Length(1),
        ])
        .split(frame.area())
    };

    let header = layout[0];
    let filter_bar = layout[1];
    let body = layout[2];
    let footer = layout[3];

    // Header with session count
    let total = app.all_sessions.len();
    let filtered = app.sessions.len();
    let mut count_text = if app.filter_text.is_empty() {
        format!(" {} sessions ", total)
    } else {
        format!(" {}/{} sessions ", filtered, total)
    };
    if !app.tag_filter.is_empty() {
        count_text.push_str(&format!("[tags:{}] ", app.tag_filter.join(",")));
    }
    if let Some(ws) = app.active_workspace_name() {
        count_text.push_str(&format!("[ws:{}] ", ws));
    }

    let header_line = Line::from(vec![
        Span::styled(
            " Claude Deck ",
            Style::new().fg(Color::Cyan).add_modifier(Modifier::BOLD),
        ),
        Span::styled(count_text, Style::new().fg(Color::DarkGray)),
    ]);
    let title = Paragraph::new(header_line).block(Block::bordered());
    frame.render_widget(title, header);

    // Filter bar
    if show_filter_bar {
        let is_active = app.mode == Mode::Filter;

        let mut spans = vec![
            Span::styled(
                " / ",
                Style::new()
                    .fg(Color::Black)
                    .bg(Color::Yellow)
                    .add_modifier(Modifier::BOLD),
            ),
            Span::styled(" ", Style::default()),
        ];

        if app.filter_text.is_empty() && is_active {
            spans.push(Span::styled(
                "Type to filter sessions...",
                Style::new().fg(Color::DarkGray),
            ));
        } else {
            spans.push(Span::styled(
                &app.filter_text,
                Style::new().fg(Color::White).add_modifier(Modifier::BOLD),
            ));
        }

        if is_active {
            spans.push(Span::styled("█", Style::new().fg(Color::Yellow)));
        }

        let border_style = if is_active {
            Style::new().fg(Color::Yellow)
        } else {
            Style::new().fg(Color::DarkGray)
        };

        let filter_block = Block::bordered()
            .title(" Filter ")
            .border_style(border_style);
        let filter_paragraph = Paragraph::new(Line::from(spans)).block(filter_block);
        frame.render_widget(filter_paragraph, filter_bar);
    }

    // Body: optional logs panel at the bottom
    let (main_body, logs_area) = if app.show_logs {
        let [main, logs] =
            Layout::vertical([Constraint::Fill(1), Constraint::Length(8)]).areas(body);
        (main, Some(logs))
    } else {
        (body, None)
    };

    // Body: left = sessions table, right = details + preview
    let ratio = app.panel_ratio;
    let [left, right] = Layout::horizontal([
        Constraint::Percentage(ratio),
        Constraint::Percentage(100 - ratio),
    ])
    .areas(main_body);

    sessions_table::render(frame, app, left);

    // Right panel: details on top, preview below
    let [detail_area, preview_area] =
        Layout::vertical([Constraint::Length(15), Constraint::Fill(1)]).areas(right);

    detail_panel::render(frame, app, detail_area);
    preview_panel::render(frame, app, preview_area);

    // Logs panel
    if let Some(logs) = logs_area {
        logs_panel::render(frame, app, logs);
    }

    // Footer
    help_bar::render(frame, app, footer);

    // Error message overlay
    if let Some(ref msg) = app.error_message {
        let error = Paragraph::new(msg.as_str())
            .style(Style::new().fg(Color::Red).add_modifier(Modifier::BOLD));
        frame.render_widget(error, footer);
    }

    // Modal overlays
    match app.mode {
        Mode::LaunchDialog => launch_dialog::render(frame, app),
        Mode::ConfirmKill => confirm_dialog::render(frame, app),
        Mode::SendPrompt => send_dialog::render(frame, app),
        Mode::Rename => rename_dialog::render(frame, app),
        Mode::TagPicker => picker_dialog::render(frame, app),
        Mode::WorkspacePicker => workspace_dialog::render_picker(frame, app),
        Mode::WorkspaceAdd => workspace_dialog::render_add(frame, app),
        Mode::QuickActionList => quick_action_dialog::render_list(frame, app),
        Mode::QuickActionAdd | Mode::QuickActionEdit => {
            quick_action_dialog::render_edit(frame, app)
        }
        Mode::QuickActionConfirmDelete => quick_action_dialog::render_confirm_delete(frame, app),
        Mode::Filter | Mode::Normal => {}
    }

    // Flash toast
    if let Some(flash) = app.active_flash() {
        let text = format!(" {} ", flash);
        let width = text.chars().count() as u16 + 4;
        let area = frame.area();
        let toast = Rect {
            x: area.x + (area.width.saturating_sub(width)) / 2,
            y: area.y + area.height.saturating_sub(4),
            width: width.min(area.width),
            height: 3,
        };
        frame.render_widget(Clear, toast);
        frame.render_widget(
            Paragraph::new(text)
                .alignment(Alignment::Center)
                .style(
                    Style::new()
                        .fg(Color::White)
                        .bg(Color::Green)
                        .add_modifier(Modifier::BOLD),
                )
                .block(Block::bordered().style(Style::new().fg(Color::White).bg(Color::Green))),
            toast,
        );
    }
}
