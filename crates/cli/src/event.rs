use std::time::Duration;

use anyhow::Result;
use crossterm::event::{self, Event, KeyEvent, MouseEvent};

pub enum AppEvent {
    Key(KeyEvent),
    Mouse(MouseEvent),
    Tick,
}

pub fn poll_event(tick_rate: Duration) -> Result<AppEvent> {
    if event::poll(tick_rate)? {
        match event::read()? {
            Event::Key(key) => return Ok(AppEvent::Key(key)),
            Event::Mouse(mouse) => return Ok(AppEvent::Mouse(mouse)),
            _ => {}
        }
    }
    Ok(AppEvent::Tick)
}
