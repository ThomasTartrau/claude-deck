use ratatui::layout::{Constraint, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::widgets::{Block, Cell, Row, Table};
use ratatui::Frame;

use super::utils::{status_icon, status_icon_style};
use crate::app::{App, SortBy};
use crate::config::Workspace;
use crate::model::session::Session;

pub fn render(frame: &mut Frame, app: &mut App, area: Rect) {
    let tick = app.tick;
    let sort_by = app.sort_by;
    let has_tags = !app.config.tags.is_empty();
    let has_workspaces = !app.config.workspaces.is_empty();

    let has_costs = !app.session_costs.is_empty();

    let mut header_cells: Vec<&str> =
        vec![sort_label("NAME", SortBy::Name, sort_by), "BRANCH", "GIT"];
    if has_workspaces {
        header_cells.push("WS");
    }
    if has_tags {
        header_cells.push("TAGS");
    }
    if has_costs {
        header_cells.push("COST");
    }
    header_cells.push(sort_label("AGE", SortBy::Age, sort_by));
    header_cells.push(sort_label("ST", SortBy::Status, sort_by));

    let header = Row::new(header_cells)
        .style(Style::new().fg(Color::Yellow).add_modifier(Modifier::BOLD))
        .bottom_margin(1);

    let rows: Vec<Row> = app
        .sessions
        .iter()
        .map(|s| {
            let symbol = status_icon(&s.status);
            let style = status_icon_style(&s.status, tick);
            let git_display = s.git_status_display();
            let git_style = if s.is_git_dirty() {
                Style::new().fg(Color::Yellow)
            } else {
                Style::new().fg(Color::Green)
            };

            let mut cells = vec![
                Cell::from(s.name.as_str()),
                Cell::from(s.branch.as_str()),
                Cell::from(git_display).style(git_style),
            ];
            if has_workspaces {
                let ws_name = workspace_for_session(s, &app.config.workspaces);
                cells.push(Cell::from(ws_name).style(Style::new().fg(Color::Cyan)));
            }
            if has_tags {
                let tags = app.config.tags_for(&s.name);
                let tags_str = if tags.is_empty() {
                    String::new()
                } else {
                    tags.join(",")
                };
                cells.push(Cell::from(tags_str).style(Style::new().fg(Color::Magenta)));
            }
            if has_costs {
                let cost_str = app
                    .session_costs
                    .get(&s.name)
                    .map(|c| c.cost_display())
                    .unwrap_or_default();
                cells.push(Cell::from(cost_str).style(Style::new().fg(Color::Cyan)));
            }
            cells.push(Cell::from(s.age_display()));
            cells.push(Cell::from(symbol).style(style));

            Row::new(cells)
        })
        .collect();

    let mut widths: Vec<Constraint> = vec![
        Constraint::Min(16),
        Constraint::Min(14),
        Constraint::Length(8),
    ];
    if has_workspaces {
        widths.push(Constraint::Length(14));
    }
    if has_tags {
        widths.push(Constraint::Length(12));
    }
    if has_costs {
        widths.push(Constraint::Length(8));
    }
    widths.push(Constraint::Length(5));
    widths.push(Constraint::Length(3));

    let table = Table::new(rows, widths)
        .header(header)
        .block(Block::bordered().title(" Sessions "))
        .column_spacing(1)
        .row_highlight_style(
            Style::new()
                .bg(Color::DarkGray)
                .add_modifier(Modifier::BOLD),
        )
        .highlight_symbol(" > ");

    frame.render_stateful_widget(table, area, &mut app.table_state);
}

fn workspace_for_session(session: &Session, workspaces: &[Workspace]) -> String {
    let pane_path = match session.pane_path.as_deref() {
        Some(p) => p.trim_end_matches('/'),
        None => return String::new(),
    };
    for ws in workspaces {
        let wp = ws.path.trim_end_matches('/');
        if pane_path == wp || pane_path.starts_with(&format!("{}/", wp)) {
            return ws.name.clone();
        }
    }
    String::new()
}

fn sort_label(name: &'static str, column: SortBy, current: SortBy) -> &'static str {
    if column == current {
        match name {
            "NAME" => "NAME \u{25b2}",
            "AGE" => "AGE \u{25b2}",
            "ST" => "ST \u{25b2}",
            _ => name,
        }
    } else {
        name
    }
}
