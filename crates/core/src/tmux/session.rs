use anyhow::Result;

use crate::claude::hooks;
use crate::model::session::{Session, SessionStatus};
use crate::tmux::command::{capture_pane, run_tmux_allow_failure};
use crate::tmux::parser;

pub const SESSION_PREFIX: &str = "cc-";

const SESSION_FORMAT: &str = "#{session_name}|#{session_created}|#{pane_pid}|#{pane_current_path}";

pub fn list_sessions() -> Result<Vec<Session>> {
    let output = match run_tmux_allow_failure(&["list-sessions", "-F", SESSION_FORMAT]) {
        Some(o) => o,
        None => return Ok(Vec::new()),
    };

    // Cache git info by path to avoid duplicate git calls for sessions in the same repo
    let mut git_cache: std::collections::HashMap<String, GitInfo> =
        std::collections::HashMap::new();

    let mut sessions = Vec::new();
    for line in output.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let info = match parser::parse_session_line(line) {
            Ok(i) => i,
            Err(_) => continue,
        };

        let pane_is_claude = is_pane_running_claude(info.pane_pid);
        let is_claude = is_claude_session(&info.name, None) || pane_is_claude;

        if !is_claude {
            continue;
        }

        let git_info = match info.pane_current_path.as_deref() {
            Some(p) if !p.is_empty() => git_cache
                .entry(p.to_string())
                .or_insert_with(|| resolve_git_info(Some(p))),
            _ => git_cache
                .entry(String::new())
                .or_insert_with(|| resolve_git_info(None)),
        };

        let status = if !pane_is_claude {
            SessionStatus::Dead
        } else {
            detect_pane_status(&info.name, info.pane_pid)
        };

        sessions.push(Session {
            name: info.name,
            branch: git_info.branch.clone(),
            created_at: info.created,
            status,
            pane_pid: info.pane_pid,
            pane_path: info.pane_current_path,
            git_dirty_count: git_info.dirty_count,
            git_insertions: git_info.insertions,
            git_deletions: git_info.deletions,
            git_ahead: git_info.ahead,
            git_behind: git_info.behind,
        });
    }

    sessions.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(sessions)
}

/// Inline detector logic: check if a session belongs to Claude.
pub fn is_claude_session(session_name: &str, pane_command: Option<&str>) -> bool {
    if session_name.starts_with(SESSION_PREFIX) {
        return true;
    }
    if let Some(cmd) = pane_command {
        return cmd == "claude";
    }
    false
}

/// Check if the pane's process tree contains "claude" by looking at `ps`
pub fn is_pane_running_claude(pane_pid: Option<u32>) -> bool {
    let pid = match pane_pid {
        Some(p) => p,
        None => return false,
    };

    std::process::Command::new("ps")
        .args(["-o", "command=", "-p", &pid.to_string()])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| {
            let cmd = String::from_utf8_lossy(&o.stdout);
            cmd.contains("claude")
        })
        .unwrap_or(false)
}

/// Detect Claude session status via hook state files with pane-based fallback.
///
/// Claude Code hooks write status to the cache dir (~/Library/Caches/claude-deck/status/).
/// However, tool interruptions (ctrl+c) don't fire any hook, leaving the file
/// stuck on "running". As a fallback, when the status file says "running" but
/// is stale (>10s old), we check the tmux pane for interruption markers.
pub fn detect_pane_status(session_name: &str, _pane_pid: Option<u32>) -> SessionStatus {
    let status = hooks::read_session_status(session_name).unwrap_or(SessionStatus::Idle);

    if status != SessionStatus::Running {
        return status;
    }

    // Check if the status file is stale — if recently updated, trust it
    let status_path = hooks::status_file_path(session_name);
    let is_stale = std::fs::metadata(&status_path)
        .ok()
        .and_then(|m| m.modified().ok())
        .map(|t| t.elapsed().unwrap_or_default().as_secs() > 10)
        .unwrap_or(false);

    if !is_stale {
        return SessionStatus::Running;
    }

    // Stale "running" — check pane content for interruption/idle markers
    if pane_looks_idle(session_name) {
        // Update the status file so we don't re-check every tick
        let _ = std::fs::write(&status_path, "idle");
        SessionStatus::Idle
    } else {
        SessionStatus::Running
    }
}

/// Check the last lines of a tmux pane for signs that Claude is idle/interrupted.
pub fn pane_looks_idle(session_name: &str) -> bool {
    let output = match capture_pane(session_name, 5) {
        Some(o) => o,
        None => return false,
    };

    let text = output.to_lowercase();

    // If Claude is actively processing, the pane is NOT idle — even if the › prompt is visible.
    // These markers indicate Claude is thinking, streaming, or running tools.
    const ACTIVE_MARKERS: &[&str] = &[
        "hyperspacing",
        "thinking",
        "running",
        "streaming",
        "compressing",
    ];
    if ACTIVE_MARKERS.iter().any(|m| text.contains(m)) {
        return false;
    }

    // "interrupted" appears when user ctrl+c's a running tool
    // "what should claude do" is the follow-up prompt after interruption
    // ">" at the start of a line is the input prompt
    text.contains("interrupted")
        || text.contains("what should claude do")
        || output.lines().rev().any(|line| {
            let trimmed = line.trim();
            trimmed.starts_with('\u{276f}') || trimmed.starts_with('>')
        })
}

pub struct GitInfo {
    pub branch: String,
    pub dirty_count: u32,
    pub insertions: u32,
    pub deletions: u32,
    pub ahead: u32,
    pub behind: u32,
}

pub fn resolve_git_info(path: Option<&str>) -> GitInfo {
    let default = GitInfo {
        branch: "-".into(),
        dirty_count: 0,
        insertions: 0,
        deletions: 0,
        ahead: 0,
        behind: 0,
    };
    let path = match path {
        Some(p) if !p.is_empty() => p,
        _ => return default,
    };

    // Single call: branch + dirty count + ahead/behind
    let (branch, dirty_count, ahead, behind) = std::process::Command::new("git")
        .args(["-C", path, "status", "--porcelain", "-b"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| {
            let s = String::from_utf8_lossy(&o.stdout);
            let mut lines = s.lines();
            let header = lines.next().unwrap_or("");

            // Parse branch from "## branch...origin/branch [ahead N, behind M]"
            let br = header
                .strip_prefix("## ")
                .unwrap_or("-")
                .split("...")
                .next()
                .unwrap_or("-")
                .to_string();

            // Parse ahead/behind from header
            let mut ah: u32 = 0;
            let mut bh: u32 = 0;
            if let Some(bracket) = header.split('[').nth(1) {
                for part in bracket.trim_end_matches(']').split(", ") {
                    let part = part.trim();
                    if let Some(n) = part.strip_prefix("ahead ") {
                        ah = n.parse().unwrap_or(0);
                    } else if let Some(n) = part.strip_prefix("behind ") {
                        bh = n.parse().unwrap_or(0);
                    }
                }
            }

            let dirty = lines.filter(|l| !l.trim().is_empty()).count() as u32;
            (br, dirty, ah, bh)
        })
        .unwrap_or_else(|| ("-".into(), 0, 0, 0));

    // Single call: insertions/deletions (staged + unstaged vs HEAD)
    let (insertions, deletions) = std::process::Command::new("git")
        .args(["-C", path, "diff", "HEAD", "--shortstat"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| {
            let s = String::from_utf8_lossy(&o.stdout);
            let mut ins: u32 = 0;
            let mut del: u32 = 0;
            for part in s.split(", ") {
                let part = part.trim();
                if part.ends_with("insertion(+)") || part.ends_with("insertions(+)") {
                    ins = part
                        .split_whitespace()
                        .next()
                        .and_then(|n| n.parse().ok())
                        .unwrap_or(0);
                } else if part.ends_with("deletion(-)") || part.ends_with("deletions(-)") {
                    del = part
                        .split_whitespace()
                        .next()
                        .and_then(|n| n.parse().ok())
                        .unwrap_or(0);
                }
            }
            (ins, del)
        })
        .unwrap_or((0, 0));

    GitInfo {
        branch,
        dirty_count,
        insertions,
        deletions,
        ahead,
        behind,
    }
}
