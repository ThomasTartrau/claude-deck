use std::time::{Duration, Instant};

use crate::model::session::SessionStatus;

#[derive(Debug, Clone)]
pub struct SessionDurations {
    pub running_duration: Duration,
    pub waiting_duration: Duration,
    pub last_status: Option<SessionStatus>,
    pub last_updated: Instant,
}

impl Default for SessionDurations {
    fn default() -> Self {
        Self::new()
    }
}

impl SessionDurations {
    pub fn new() -> Self {
        Self {
            running_duration: Duration::ZERO,
            waiting_duration: Duration::ZERO,
            last_status: None,
            last_updated: Instant::now(),
        }
    }

    pub fn update(&mut self, current_status: &SessionStatus) {
        let elapsed = self.last_updated.elapsed();

        if let Some(ref prev) = self.last_status {
            match prev {
                SessionStatus::Running => self.running_duration += elapsed,
                SessionStatus::Waiting => self.waiting_duration += elapsed,
                _ => {}
            }
        }

        self.last_status = Some(current_status.clone());
        self.last_updated = Instant::now();
    }

    pub fn format_running(&self) -> String {
        format_duration(self.running_duration)
    }

    pub fn format_waiting(&self) -> String {
        format_duration(self.waiting_duration)
    }
}

pub fn format_duration(d: Duration) -> String {
    let secs = d.as_secs();
    if secs < 60 {
        format!("{}s", secs)
    } else if secs < 3600 {
        format!("{}m {}s", secs / 60, secs % 60)
    } else {
        format!("{}h {}m", secs / 3600, (secs % 3600) / 60)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_duration_seconds() {
        assert_eq!(format_duration(Duration::from_secs(45)), "45s");
    }

    #[test]
    fn format_duration_minutes() {
        assert_eq!(format_duration(Duration::from_secs(125)), "2m 5s");
    }

    #[test]
    fn format_duration_hours() {
        assert_eq!(format_duration(Duration::from_secs(3665)), "1h 1m");
    }

    #[test]
    fn format_duration_zero() {
        assert_eq!(format_duration(Duration::ZERO), "0s");
    }

    #[test]
    fn new_durations_are_zero() {
        let d = SessionDurations::new();
        assert_eq!(d.running_duration, Duration::ZERO);
        assert_eq!(d.waiting_duration, Duration::ZERO);
    }

    #[test]
    fn update_accumulates_running() {
        let mut d = SessionDurations::new();
        // First update sets the status but no prior state to accumulate
        d.update(&SessionStatus::Running);
        // Simulate time passing by directly adjusting last_updated
        d.last_updated = Instant::now() - Duration::from_secs(5);
        d.update(&SessionStatus::Running);
        assert!(d.running_duration >= Duration::from_secs(4));
    }

    #[test]
    fn update_accumulates_waiting() {
        let mut d = SessionDurations::new();
        d.update(&SessionStatus::Waiting);
        d.last_updated = Instant::now() - Duration::from_secs(3);
        d.update(&SessionStatus::Waiting);
        assert!(d.waiting_duration >= Duration::from_secs(2));
    }

    #[test]
    fn update_does_not_accumulate_idle() {
        let mut d = SessionDurations::new();
        d.update(&SessionStatus::Idle);
        d.last_updated = Instant::now() - Duration::from_secs(10);
        d.update(&SessionStatus::Idle);
        assert_eq!(d.running_duration, Duration::ZERO);
        assert_eq!(d.waiting_duration, Duration::ZERO);
    }

    #[test]
    fn format_running_and_waiting() {
        let d = SessionDurations {
            running_duration: Duration::from_secs(125),
            waiting_duration: Duration::from_secs(45),
            last_status: None,
            last_updated: Instant::now(),
        };
        assert_eq!(d.format_running(), "2m 5s");
        assert_eq!(d.format_waiting(), "45s");
    }

    #[test]
    fn format_duration_exactly_60_seconds() {
        assert_eq!(format_duration(Duration::from_secs(60)), "1m 0s");
    }

    #[test]
    fn format_duration_exactly_3600_seconds() {
        assert_eq!(format_duration(Duration::from_secs(3600)), "1h 0m");
    }

    #[test]
    fn format_duration_large_value_days_worth() {
        // 2 days + 3 hours + 15 minutes = 172800 + 10800 + 900 = 184500 seconds
        let d = Duration::from_secs(184500);
        // 184500 / 3600 = 51h, (184500 % 3600) / 60 = 15m
        assert_eq!(format_duration(d), "51h 15m");
    }

    #[test]
    fn update_transition_running_to_waiting_accumulates() {
        let mut d = SessionDurations::new();

        // Start running
        d.update(&SessionStatus::Running);
        // Simulate 5 seconds of running
        d.last_updated = Instant::now() - Duration::from_secs(5);

        // Transition to waiting — should accumulate the 5s into running_duration
        d.update(&SessionStatus::Waiting);
        assert!(d.running_duration >= Duration::from_secs(4));
        assert_eq!(d.waiting_duration, Duration::ZERO);

        // Simulate 3 seconds of waiting
        d.last_updated = Instant::now() - Duration::from_secs(3);

        // Update again — should accumulate the 3s into waiting_duration
        d.update(&SessionStatus::Running);
        assert!(d.waiting_duration >= Duration::from_secs(2));
        // running_duration should still have the previous accumulation
        assert!(d.running_duration >= Duration::from_secs(4));
    }
}
