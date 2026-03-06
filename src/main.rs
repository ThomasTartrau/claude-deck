mod app;
mod claude;
mod cli;
mod config;
mod event;
mod model;
mod tmux;
mod ui;

use std::io;
use std::time::{Duration, Instant};

use anyhow::Result;
use clap::Parser;
use crossterm::event::KeyEventKind;
use crossterm::event::MouseEventKind;
use crossterm::terminal::{
    disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen,
};
use crossterm::ExecutableCommand;
use ratatui::backend::CrosstermBackend;
use ratatui::Terminal;

use crate::app::App;
use crate::cli::{Cli, Command};
use crate::config::Config;
use crate::event::{poll_event, AppEvent};

const TICK_RATE: Duration = Duration::from_millis(250);

fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Some(cmd) => run_command(cmd),
        None => run_tui_mode(),
    }
}

fn run_command(cmd: Command) -> Result<()> {
    match cmd {
        Command::List => cmd_list(),
        Command::Launch { name, prompt, path } => {
            cmd_launch(&name, prompt.as_deref(), path.as_deref())
        }
        Command::Kill { name } => cmd_kill(&name),
        Command::Resume { name, path } => cmd_resume(&name, path.as_deref()),
        Command::Attach { name } => cmd_attach(&name),
        Command::Rename { old, new } => cmd_rename(&old, &new),
        Command::Send { name, text } => cmd_send(&name, &text),
        Command::Tag { name, tags } => cmd_tag(&name, &tags),
        Command::Tags => cmd_tags(),
    }
}

fn cmd_list() -> Result<()> {
    let config = Config::load();
    let sessions = tmux::session::list_sessions()?;

    let json_sessions: Vec<serde_json::Value> = sessions
        .iter()
        .map(|s| {
            serde_json::json!({
                "name": s.name,
                "status": format!("{:?}", s.status),
                "branch": s.branch,
                "created_at": s.created_at.to_rfc3339(),
                "pane_path": s.pane_path,
                "git_dirty_count": s.git_dirty_count,
                "git_insertions": s.git_insertions,
                "git_deletions": s.git_deletions,
                "git_ahead": s.git_ahead,
                "git_behind": s.git_behind,
                "tags": config.tags_for(&s.name),
            })
        })
        .collect();

    println!("{}", serde_json::to_string_pretty(&json_sessions)?);
    Ok(())
}

fn cmd_launch(name: &str, prompt: Option<&str>, path: Option<&str>) -> Result<()> {
    claude::launcher::launch_claude_session(name, prompt, path)?;
    let session_name = claude::launcher::prefixed_name(name);
    println!("{}", serde_json::json!({ "launched": session_name }));

    // Persist session
    let mut saved = config::load_saved_sessions();
    let pane_path = path.unwrap_or(".").to_string();
    if !saved.iter().any(|s| s.name == session_name) {
        saved.push(config::SavedSession {
            name: session_name,
            path: pane_path,
        });
        config::save_sessions(&saved);
    }
    Ok(())
}

fn cmd_kill(name: &str) -> Result<()> {
    tmux::session::kill_session(name)?;
    println!("{}", serde_json::json!({ "killed": name }));

    // Remove from persisted sessions
    let mut saved = config::load_saved_sessions();
    saved.retain(|s| s.name != name);
    config::save_sessions(&saved);
    Ok(())
}

fn cmd_resume(name: &str, path: Option<&str>) -> Result<()> {
    claude::launcher::resume_claude_session(name, path)?;
    println!("{}", serde_json::json!({ "resumed": name }));
    Ok(())
}

fn cmd_attach(name: &str) -> Result<()> {
    let status = tmux::command::attach_session(name)?;
    if !status.success() {
        anyhow::bail!("tmux attach exited with status {}", status);
    }
    Ok(())
}

fn cmd_rename(old: &str, new: &str) -> Result<()> {
    tmux::command::rename_session(old, new)?;
    println!(
        "{}",
        serde_json::json!({ "renamed": { "from": old, "to": new } })
    );

    // Update persisted sessions and tags
    let mut saved = config::load_saved_sessions();
    for s in &mut saved {
        if s.name == old {
            s.name = new.to_string();
        }
    }
    config::save_sessions(&saved);

    let mut config = Config::load();
    let tags = config.tags_for(old);
    if !tags.is_empty() {
        config.set_tags(old, vec![]);
        config.set_tags(new, tags);
        config.save();
    }
    Ok(())
}

fn cmd_send(name: &str, text: &str) -> Result<()> {
    tmux::command::send_keys(name, text)?;
    println!("{}", serde_json::json!({ "sent_to": name }));
    Ok(())
}

fn parse_tags(tags: &str) -> Vec<String> {
    if tags.is_empty() {
        vec![]
    } else {
        tags.split(',')
            .map(|t| t.trim().to_string())
            .filter(|t| !t.is_empty())
            .collect()
    }
}

fn cmd_tag(name: &str, tags: &str) -> Result<()> {
    let mut config = Config::load();
    let tag_list = parse_tags(tags);
    config.set_tags(name, tag_list.clone());
    config.save();
    println!(
        "{}",
        serde_json::json!({ "session": name, "tags": tag_list })
    );
    Ok(())
}

fn cmd_tags() -> Result<()> {
    let config = Config::load();
    println!("{}", serde_json::json!(config.all_tags()));
    Ok(())
}

fn run_tui_mode() -> Result<()> {
    let config = Config::load();
    let mut app = App::new(config)?;
    app.restore_sessions();
    run_tui(&mut app)
}

fn run_tui(app: &mut App) -> Result<()> {
    setup_terminal()?;
    let result = main_loop(app);
    restore_terminal()?;
    result
}

fn setup_terminal() -> Result<()> {
    enable_raw_mode()?;
    io::stdout().execute(EnterAlternateScreen)?;
    io::stdout().execute(crossterm::event::EnableMouseCapture)?;
    Ok(())
}

fn restore_terminal() -> Result<()> {
    io::stdout().execute(crossterm::event::DisableMouseCapture)?;
    disable_raw_mode()?;
    io::stdout().execute(LeaveAlternateScreen)?;
    Ok(())
}

fn main_loop(app: &mut App) -> Result<()> {
    let mut terminal = Terminal::new(CrosstermBackend::new(io::stdout()))?;
    let mut last_refresh = Instant::now();
    let refresh_interval = Duration::from_secs(app.config.refresh_interval_secs);

    loop {
        terminal.draw(|frame| ui::render(frame, app))?;

        match poll_event(TICK_RATE)? {
            AppEvent::Key(key) => {
                if key.kind == KeyEventKind::Press {
                    app.handle_key(key);
                }
            }
            AppEvent::Mouse(mouse) => match mouse.kind {
                MouseEventKind::ScrollUp => app.scroll_preview(-3),
                MouseEventKind::ScrollDown => app.scroll_preview(3),
                _ => {}
            },
            AppEvent::Tick => {
                app.tick = app.tick.wrapping_add(1);
            }
        }

        // Auto-refresh
        if last_refresh.elapsed() >= refresh_interval {
            app.refresh();
            last_refresh = Instant::now();
        }

        // Handle attach request
        if let Some(session_name) = app.should_attach.take() {
            // Suspend TUI
            restore_terminal()?;
            drop(terminal);

            // Attach to tmux session
            let _ = tmux::command::attach_session(&session_name);

            // Resume TUI
            setup_terminal()?;
            terminal = Terminal::new(CrosstermBackend::new(io::stdout()))?;
            app.refresh();
            last_refresh = Instant::now();
        }

        if app.should_quit {
            break;
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_tags_empty_string() {
        assert_eq!(parse_tags(""), Vec::<String>::new());
    }

    #[test]
    fn parse_tags_single() {
        assert_eq!(parse_tags("backend"), vec!["backend"]);
    }

    #[test]
    fn parse_tags_multiple() {
        assert_eq!(
            parse_tags("backend,frontend,urgent"),
            vec!["backend", "frontend", "urgent"]
        );
    }

    #[test]
    fn parse_tags_trims_whitespace() {
        assert_eq!(
            parse_tags(" backend , frontend "),
            vec!["backend", "frontend"]
        );
    }

    #[test]
    fn parse_tags_skips_empty_segments() {
        assert_eq!(
            parse_tags("backend,,frontend,"),
            vec!["backend", "frontend"]
        );
    }

    #[test]
    fn parse_tags_only_commas() {
        assert_eq!(parse_tags(",,,"), Vec::<String>::new());
    }
}
