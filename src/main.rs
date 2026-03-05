mod app;
mod claude;
mod config;
mod event;
mod model;
mod tmux;
mod ui;

use std::io;
use std::time::{Duration, Instant};

use anyhow::Result;
use crossterm::event::KeyEventKind;
use crossterm::event::MouseEventKind;
use crossterm::terminal::{
    disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen,
};
use crossterm::ExecutableCommand;
use ratatui::backend::CrosstermBackend;
use ratatui::Terminal;

use crate::app::App;
use crate::config::Config;
use crate::event::{poll_event, AppEvent};

const TICK_RATE: Duration = Duration::from_millis(250);

fn main() -> Result<()> {
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
