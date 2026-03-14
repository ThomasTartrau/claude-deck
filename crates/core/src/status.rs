//! Robust session status detection using a two-layer approach:
//!
//! **Layer 1 — tmux as source of truth for alive/dead**
//! tmux always knows if the process in a pane is alive via `#{pane_dead}`.
//! This replaces fragile `ps` lookups and eliminates PID reuse risks.
//!
//! **Layer 2 — Hooks with watchdog for application status**
//! Claude Code hooks write `status:unix_timestamp` to a cache file.
//! When the timestamp is stale (> WATCHDOG_TIMEOUT_SECS) and the process
//! is alive, we assume Idle rather than parsing pane text.
//! This is the systemd watchdog pattern — if you don't report, you're idle.

use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::model::session::SessionStatus;

/// How many seconds before a "running" status is considered stale.
/// After this timeout, if the process is still alive, we assume Idle.
const WATCHDOG_TIMEOUT_SECS: u64 = 8;

/// Status entry written by hooks: "status:unix_timestamp"
#[derive(Debug, Clone, PartialEq)]
pub struct StatusEntry {
    pub status: SessionStatus,
    pub timestamp: u64,
}

impl StatusEntry {
    /// Create a new entry with the current timestamp.
    pub fn new(status: SessionStatus) -> Self {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        Self { status, timestamp }
    }

    /// Serialize to the wire format: "status:timestamp"
    pub fn serialize(&self) -> String {
        let label = match self.status {
            SessionStatus::Running => "running",
            SessionStatus::Waiting => "waiting",
            SessionStatus::Idle => "idle",
            SessionStatus::Dead => "dead",
        };
        format!("{}:{}", label, self.timestamp)
    }

    /// Parse from the wire format: "status:timestamp"
    /// Also supports legacy format (just "status" without timestamp).
    pub fn parse(content: &str) -> Option<Self> {
        let trimmed = content.trim();
        if trimmed.is_empty() {
            return None;
        }

        let (status_str, timestamp) = match trimmed.split_once(':') {
            Some((s, t)) => {
                let ts = t.parse::<u64>().unwrap_or(0);
                (s, ts)
            }
            // Legacy format: no timestamp → treat as epoch 0 (always stale)
            None => (trimmed, 0),
        };

        let status = match status_str {
            "running" => SessionStatus::Running,
            "waiting" => SessionStatus::Waiting,
            "idle" => SessionStatus::Idle,
            "dead" => SessionStatus::Dead,
            _ => return None,
        };

        Some(Self { status, timestamp })
    }

    /// Check if this entry is stale (older than WATCHDOG_TIMEOUT_SECS).
    pub fn is_stale(&self) -> bool {
        self.is_stale_with_timeout(WATCHDOG_TIMEOUT_SECS)
    }

    fn is_stale_with_timeout(&self, timeout_secs: u64) -> bool {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        now.saturating_sub(self.timestamp) > timeout_secs
    }
}

/// Determine the session status given the available signals.
///
/// This is the core decision function — pure logic, no I/O.
///
/// # Arguments
/// * `pane_dead` - Whether tmux reports the pane as dead (`#{pane_dead}` == "1")
/// * `hook_entry` - The last status written by the hook, if any
pub fn resolve_status(pane_dead: bool, hook_entry: Option<&StatusEntry>) -> SessionStatus {
    // Layer 1: tmux says the process is dead → Dead, no questions asked
    if pane_dead {
        return SessionStatus::Dead;
    }

    // Layer 2: process is alive, use hook status with watchdog
    match hook_entry {
        None => {
            // No hook file yet (session just started, or hooks not installed)
            SessionStatus::Idle
        }
        Some(entry) => {
            match entry.status {
                // Idle and Waiting are terminal states — trust them
                SessionStatus::Idle => SessionStatus::Idle,
                SessionStatus::Waiting => {
                    // Waiting shouldn't be stale for long, but if it is,
                    // the process is alive so it's probably idle
                    if entry.is_stale() {
                        SessionStatus::Idle
                    } else {
                        SessionStatus::Waiting
                    }
                }
                SessionStatus::Running => {
                    // Running + stale = watchdog timeout → assume Idle
                    // This handles ctrl+c interruptions that don't fire hooks
                    if entry.is_stale() {
                        SessionStatus::Idle
                    } else {
                        SessionStatus::Running
                    }
                }
                // Hook should never write Dead, but handle it gracefully
                SessionStatus::Dead => SessionStatus::Dead,
            }
        }
    }
}

/// Read and parse the status file for a session.
pub fn read_status_file(path: &Path) -> Option<StatusEntry> {
    fs::read_to_string(path)
        .ok()
        .and_then(|s| StatusEntry::parse(&s))
}

/// Write a status entry to the status file.
pub fn write_status_file(path: &Path, entry: &StatusEntry) {
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(path, entry.serialize());
}

/// Query tmux for whether a pane is dead.
/// Returns true if the pane's process has exited.
pub fn query_pane_dead(session_name: &str) -> bool {
    crate::tmux::command::run_tmux_allow_failure(&[
        "display-message",
        "-t",
        session_name,
        "-p",
        "#{pane_dead}",
    ])
    .map(|output| output.trim() == "1")
    .unwrap_or(true) // If tmux can't reach the session, consider it dead
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── StatusEntry::parse ───────────────────────────────────────────

    #[test]
    fn parse_running_with_timestamp() {
        let entry = StatusEntry::parse("running:1710000000").unwrap();
        assert_eq!(entry.status, SessionStatus::Running);
        assert_eq!(entry.timestamp, 1710000000);
    }

    #[test]
    fn parse_idle_with_timestamp() {
        let entry = StatusEntry::parse("idle:1710000000").unwrap();
        assert_eq!(entry.status, SessionStatus::Idle);
    }

    #[test]
    fn parse_waiting_with_timestamp() {
        let entry = StatusEntry::parse("waiting:1710000000").unwrap();
        assert_eq!(entry.status, SessionStatus::Waiting);
    }

    #[test]
    fn parse_dead_with_timestamp() {
        let entry = StatusEntry::parse("dead:1710000000").unwrap();
        assert_eq!(entry.status, SessionStatus::Dead);
    }

    #[test]
    fn parse_legacy_format_no_timestamp() {
        let entry = StatusEntry::parse("running").unwrap();
        assert_eq!(entry.status, SessionStatus::Running);
        assert_eq!(entry.timestamp, 0); // epoch 0 = always stale
    }

    #[test]
    fn parse_legacy_idle() {
        let entry = StatusEntry::parse("idle").unwrap();
        assert_eq!(entry.status, SessionStatus::Idle);
    }

    #[test]
    fn parse_with_whitespace() {
        let entry = StatusEntry::parse("  running:1710000000  \n").unwrap();
        assert_eq!(entry.status, SessionStatus::Running);
        assert_eq!(entry.timestamp, 1710000000);
    }

    #[test]
    fn parse_empty_string() {
        assert!(StatusEntry::parse("").is_none());
    }

    #[test]
    fn parse_whitespace_only() {
        assert!(StatusEntry::parse("   \n  ").is_none());
    }

    #[test]
    fn parse_unknown_status() {
        assert!(StatusEntry::parse("unknown:123").is_none());
    }

    #[test]
    fn parse_invalid_timestamp_defaults_to_zero() {
        let entry = StatusEntry::parse("running:notanumber").unwrap();
        assert_eq!(entry.status, SessionStatus::Running);
        assert_eq!(entry.timestamp, 0);
    }

    // ── StatusEntry::to_string ───────────────────────────────────────

    #[test]
    fn roundtrip_running() {
        let entry = StatusEntry {
            status: SessionStatus::Running,
            timestamp: 1710000000,
        };
        let parsed = StatusEntry::parse(&entry.serialize()).unwrap();
        assert_eq!(parsed.status, entry.status);
        assert_eq!(parsed.timestamp, entry.timestamp);
    }

    #[test]
    fn roundtrip_idle() {
        let entry = StatusEntry {
            status: SessionStatus::Idle,
            timestamp: 1710000001,
        };
        let parsed = StatusEntry::parse(&entry.serialize()).unwrap();
        assert_eq!(parsed.status, entry.status);
        assert_eq!(parsed.timestamp, entry.timestamp);
    }

    #[test]
    fn roundtrip_waiting() {
        let entry = StatusEntry {
            status: SessionStatus::Waiting,
            timestamp: 42,
        };
        let parsed = StatusEntry::parse(&entry.serialize()).unwrap();
        assert_eq!(parsed.status, entry.status);
        assert_eq!(parsed.timestamp, entry.timestamp);
    }

    #[test]
    fn roundtrip_dead() {
        let entry = StatusEntry {
            status: SessionStatus::Dead,
            timestamp: 0,
        };
        let parsed = StatusEntry::parse(&entry.serialize()).unwrap();
        assert_eq!(parsed.status, entry.status);
    }

    // ── StatusEntry::is_stale ────────────────────────────────────────

    #[test]
    fn fresh_entry_is_not_stale() {
        let entry = StatusEntry::new(SessionStatus::Running);
        assert!(!entry.is_stale());
    }

    #[test]
    fn old_entry_is_stale() {
        let entry = StatusEntry {
            status: SessionStatus::Running,
            timestamp: 0, // epoch 0 is definitely stale
        };
        assert!(entry.is_stale());
    }

    #[test]
    fn legacy_format_is_always_stale() {
        // Legacy format parses with timestamp=0
        let entry = StatusEntry::parse("running").unwrap();
        assert!(entry.is_stale());
    }

    #[test]
    fn entry_just_inside_timeout_is_not_stale() {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let entry = StatusEntry {
            status: SessionStatus::Running,
            timestamp: now - WATCHDOG_TIMEOUT_SECS + 1,
        };
        assert!(!entry.is_stale());
    }

    #[test]
    fn entry_just_outside_timeout_is_stale() {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let entry = StatusEntry {
            status: SessionStatus::Running,
            timestamp: now - WATCHDOG_TIMEOUT_SECS - 1,
        };
        assert!(entry.is_stale());
    }

    // ── resolve_status ───────────────────────────────────────────────

    #[test]
    fn pane_dead_always_returns_dead() {
        // Even with a fresh "running" hook entry, dead pane wins
        let entry = StatusEntry::new(SessionStatus::Running);
        assert_eq!(resolve_status(true, Some(&entry)), SessionStatus::Dead);
    }

    #[test]
    fn pane_dead_no_hook_entry() {
        assert_eq!(resolve_status(true, None), SessionStatus::Dead);
    }

    #[test]
    fn alive_no_hook_returns_idle() {
        assert_eq!(resolve_status(false, None), SessionStatus::Idle);
    }

    #[test]
    fn alive_fresh_running_returns_running() {
        let entry = StatusEntry::new(SessionStatus::Running);
        assert_eq!(resolve_status(false, Some(&entry)), SessionStatus::Running);
    }

    #[test]
    fn alive_stale_running_returns_idle() {
        let entry = StatusEntry {
            status: SessionStatus::Running,
            timestamp: 0,
        };
        assert_eq!(resolve_status(false, Some(&entry)), SessionStatus::Idle);
    }

    #[test]
    fn alive_fresh_idle_returns_idle() {
        let entry = StatusEntry::new(SessionStatus::Idle);
        assert_eq!(resolve_status(false, Some(&entry)), SessionStatus::Idle);
    }

    #[test]
    fn alive_stale_idle_returns_idle() {
        // Idle doesn't have a watchdog — it's already the default state
        let entry = StatusEntry {
            status: SessionStatus::Idle,
            timestamp: 0,
        };
        assert_eq!(resolve_status(false, Some(&entry)), SessionStatus::Idle);
    }

    #[test]
    fn alive_fresh_waiting_returns_waiting() {
        let entry = StatusEntry::new(SessionStatus::Waiting);
        assert_eq!(resolve_status(false, Some(&entry)), SessionStatus::Waiting);
    }

    #[test]
    fn alive_stale_waiting_returns_idle() {
        // If waiting for too long, something went wrong — fall back to idle
        let entry = StatusEntry {
            status: SessionStatus::Waiting,
            timestamp: 0,
        };
        assert_eq!(resolve_status(false, Some(&entry)), SessionStatus::Idle);
    }

    #[test]
    fn alive_hook_says_dead_returns_dead() {
        let entry = StatusEntry {
            status: SessionStatus::Dead,
            timestamp: 0,
        };
        assert_eq!(resolve_status(false, Some(&entry)), SessionStatus::Dead);
    }

    // ── resolve_status: ctrl+c scenario ──────────────────────────────

    #[test]
    fn ctrl_c_scenario_fresh_still_shows_running() {
        // User just ctrl+c'd but it's within the watchdog window
        let entry = StatusEntry::new(SessionStatus::Running);
        assert_eq!(resolve_status(false, Some(&entry)), SessionStatus::Running);
    }

    #[test]
    fn ctrl_c_scenario_after_timeout_shows_idle() {
        // User ctrl+c'd and enough time passed — watchdog kicks in
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let entry = StatusEntry {
            status: SessionStatus::Running,
            timestamp: now - WATCHDOG_TIMEOUT_SECS - 5,
        };
        assert_eq!(resolve_status(false, Some(&entry)), SessionStatus::Idle);
    }

    // ── File I/O ─────────────────────────────────────────────────────

    #[test]
    fn write_and_read_status_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test-session");

        let entry = StatusEntry {
            status: SessionStatus::Running,
            timestamp: 1710000000,
        };
        write_status_file(&path, &entry);

        let read = read_status_file(&path).unwrap();
        assert_eq!(read.status, SessionStatus::Running);
        assert_eq!(read.timestamp, 1710000000);
    }

    #[test]
    fn read_nonexistent_file_returns_none() {
        let path = Path::new("/tmp/claude-deck-test-nonexistent-file");
        assert!(read_status_file(path).is_none());
    }

    #[test]
    fn write_creates_parent_dirs() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested").join("dirs").join("status");

        let entry = StatusEntry::new(SessionStatus::Idle);
        write_status_file(&path, &entry);

        let read = read_status_file(&path).unwrap();
        assert_eq!(read.status, SessionStatus::Idle);
    }

    // ── Legacy backwards compatibility ───────────────────────────────

    #[test]
    fn legacy_running_file_treated_as_stale_idle() {
        // Old format: just "running" without timestamp
        // Should parse as timestamp=0 → stale → resolve to Idle
        let entry = StatusEntry::parse("running").unwrap();
        assert_eq!(resolve_status(false, Some(&entry)), SessionStatus::Idle);
    }

    #[test]
    fn legacy_idle_file_stays_idle() {
        let entry = StatusEntry::parse("idle").unwrap();
        assert_eq!(resolve_status(false, Some(&entry)), SessionStatus::Idle);
    }

    #[test]
    fn legacy_waiting_file_treated_as_stale_idle() {
        let entry = StatusEntry::parse("waiting").unwrap();
        assert_eq!(resolve_status(false, Some(&entry)), SessionStatus::Idle);
    }
}
