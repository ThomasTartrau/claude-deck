use anyhow::Result;

use crate::claude::hooks;
use crate::model::session::{Session, SessionStatus};
use crate::status;
use crate::tmux::command::run_tmux_allow_failure;
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

        let is_claude = is_claude_session(&info.name, None);

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

        // Layer 1: tmux is the source of truth for alive/dead
        let pane_dead = status::query_pane_dead(&info.name);

        // Layer 2: hooks with watchdog for application status
        let hook_entry = hooks::read_status_entry(&info.name);
        let session_status = status::resolve_status(pane_dead, hook_entry.as_ref());

        // If watchdog resolved a stale status to Idle, update the file
        // so the next tick doesn't re-evaluate
        if !pane_dead && session_status == SessionStatus::Idle {
            if let Some(ref entry) = hook_entry {
                if entry.status == SessionStatus::Running || entry.status == SessionStatus::Waiting
                {
                    let idle_entry = status::StatusEntry::new(SessionStatus::Idle);
                    let status_path = hooks::status_file_path(&info.name);
                    status::write_status_file(&status_path, &idle_entry);
                }
            }
        }

        sessions.push(Session {
            name: info.name,
            branch: git_info.branch.clone(),
            created_at: info.created,
            status: session_status,
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
