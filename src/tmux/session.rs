use anyhow::Result;

use crate::claude::detector;
use crate::model::session::{Session, SessionStatus};
use crate::tmux::command::{run_tmux, run_tmux_allow_failure};
use crate::tmux::parser;

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
        let is_claude = detector::is_claude_session(&info.name, None) || pane_is_claude;

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
            detect_pane_status(&info.name)
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

/// Check if the pane's process tree contains "claude" by looking at `ps`
fn is_pane_running_claude(pane_pid: Option<u32>) -> bool {
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

/// Detect Claude session status from the visible pane content.
///
/// - Running: spinner chars (◐◑◒◓ or braille) = tool in progress
/// - Waiting: ⏺ marker found = Claude finished, needs user input
/// - Idle: fresh session, no conversation yet
fn detect_pane_status(session_name: &str) -> SessionStatus {
    let content = match run_tmux_allow_failure(&["capture-pane", "-t", session_name, "-p"]) {
        Some(c) => c,
        None => return SessionStatus::Idle,
    };

    // Work on raw content to preserve all unicode markers
    let tail_lines: Vec<&str> = content
        .lines()
        .rev()
        .filter(|l| !l.trim().is_empty())
        .take(15)
        .collect();

    // Check for active tool indicators in the status bar area.
    // Active tools show spinner characters in the status bar:
    //   ◐ ◑ ◒ ◓ (U+25D0-25D3) = rotating circle spinner
    //   Braille spinners (⠋⠙⠹...) = alternative spinner
    // Also check the status bar line for multiple spinners like "◐ Tool | ◐ Tool"
    const CIRCLE_SPINNERS: [char; 4] = ['\u{25D0}', '\u{25D1}', '\u{25D2}', '\u{25D3}'];
    const BRAILLE_SPINNERS: [char; 10] = [
        '\u{280B}', '\u{2809}', '\u{2839}', '\u{2838}', '\u{283C}', '\u{2834}', '\u{2826}',
        '\u{2827}', '\u{2807}', '\u{280F}',
    ];

    let is_running = tail_lines.iter().any(|line| {
        let t = line.trim();
        CIRCLE_SPINNERS.iter().any(|&c| t.contains(c))
            || BRAILLE_SPINNERS.iter().any(|&c| t.starts_with(c))
    });

    if is_running {
        return SessionStatus::Running;
    }

    // Check if Claude has spoken (⏺ U+23FA is Claude's response marker)
    // If present, Claude finished a turn and is waiting for user input
    if content.contains('\u{23FA}') {
        return SessionStatus::Waiting;
    }

    SessionStatus::Idle
}

struct GitInfo {
    branch: String,
    dirty_count: u32,
    insertions: u32,
    deletions: u32,
    ahead: u32,
    behind: u32,
}

fn resolve_git_info(path: Option<&str>) -> GitInfo {
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

pub fn kill_session(name: &str) -> Result<()> {
    run_tmux(&["kill-session", "-t", name])?;
    Ok(())
}
