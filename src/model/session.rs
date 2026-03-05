use chrono::{DateTime, Local};

#[derive(Debug, Clone, PartialEq)]
pub enum SessionStatus {
    Running,
    Waiting,
    Idle,
    Dead,
}

impl SessionStatus {
    pub fn label(&self) -> &str {
        match self {
            SessionStatus::Running => "Running",
            SessionStatus::Waiting => "Waiting",
            SessionStatus::Idle => "Idle",
            SessionStatus::Dead => "Dead",
        }
    }
}

#[derive(Debug, Clone)]
pub struct Session {
    pub name: String,
    pub branch: String,
    pub created_at: DateTime<Local>,
    pub status: SessionStatus,
    pub pane_pid: Option<u32>,
    pub pane_path: Option<String>,
    pub git_dirty_count: u32,
    pub git_insertions: u32,
    pub git_deletions: u32,
    pub git_ahead: u32,
    pub git_behind: u32,
}

impl Session {
    pub fn age_display(&self) -> String {
        let duration = Local::now().signed_duration_since(self.created_at);
        let secs = duration.num_seconds();
        if secs < 60 {
            format!("{}s", secs)
        } else if secs < 3600 {
            format!("{}m", secs / 60)
        } else if secs < 86400 {
            format!("{}h", secs / 3600)
        } else {
            format!("{}d", secs / 86400)
        }
    }

    pub fn git_status_display(&self) -> String {
        let mut parts = Vec::new();
        if self.git_dirty_count > 0 {
            let mut dirty = format!("~{}", self.git_dirty_count);
            if self.git_insertions > 0 {
                dirty.push_str(&format!(" +{}", self.git_insertions));
            }
            if self.git_deletions > 0 {
                dirty.push_str(&format!(" -{}", self.git_deletions));
            }
            parts.push(dirty);
        }
        if self.git_ahead > 0 {
            parts.push(format!("\u{2191}{}", self.git_ahead));
        }
        if self.git_behind > 0 {
            parts.push(format!("\u{2193}{}", self.git_behind));
        }
        if parts.is_empty() {
            "\u{2713}".to_string()
        } else {
            parts.join(" ")
        }
    }

    pub fn is_git_dirty(&self) -> bool {
        self.git_dirty_count > 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_session(
        dirty: u32,
        insertions: u32,
        deletions: u32,
        ahead: u32,
        behind: u32,
    ) -> Session {
        Session {
            name: "test".into(),
            branch: "main".into(),
            created_at: Local::now(),
            status: SessionStatus::Running,
            pane_pid: None,
            pane_path: None,
            git_dirty_count: dirty,
            git_insertions: insertions,
            git_deletions: deletions,
            git_ahead: ahead,
            git_behind: behind,
        }
    }

    #[test]
    fn git_status_clean() {
        let s = make_session(0, 0, 0, 0, 0);
        assert_eq!(s.git_status_display(), "\u{2713}");
    }

    #[test]
    fn git_status_dirty_with_insertions_and_deletions() {
        let s = make_session(3, 10, 5, 0, 0);
        assert_eq!(s.git_status_display(), "~3 +10 -5");
    }

    #[test]
    fn git_status_dirty_no_diff() {
        let s = make_session(2, 0, 0, 0, 0);
        assert_eq!(s.git_status_display(), "~2");
    }

    #[test]
    fn git_status_ahead_and_behind() {
        let s = make_session(0, 0, 0, 3, 1);
        assert_eq!(s.git_status_display(), "\u{2191}3 \u{2193}1");
    }

    #[test]
    fn git_status_dirty_and_ahead() {
        let s = make_session(1, 5, 0, 2, 0);
        assert_eq!(s.git_status_display(), "~1 +5 \u{2191}2");
    }

    #[test]
    fn is_git_dirty_true_when_count_positive() {
        let s = make_session(1, 0, 0, 0, 0);
        assert!(s.is_git_dirty());
    }

    #[test]
    fn is_git_dirty_false_when_count_zero() {
        let s = make_session(0, 0, 0, 0, 0);
        assert!(!s.is_git_dirty());
    }

    #[test]
    fn status_labels() {
        assert_eq!(SessionStatus::Running.label(), "Running");
        assert_eq!(SessionStatus::Waiting.label(), "Waiting");
        assert_eq!(SessionStatus::Idle.label(), "Idle");
        assert_eq!(SessionStatus::Dead.label(), "Dead");
    }
}
