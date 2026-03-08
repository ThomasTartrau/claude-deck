use std::process::Command;

use anyhow::{Context, Result};

use super::hooks;

pub const SESSION_PREFIX: &str = "cc-";

pub fn launch_claude_session(name: &str, prompt: Option<&str>, repo: Option<&str>) -> Result<()> {
    let session_name = prefixed_name(name);
    let cwd = match repo {
        Some(r) => r.to_string(),
        None => find_git_root().context("Not inside a git repository")?,
    };

    let mut claude_cmd = String::from("claude --dangerously-skip-permissions");
    // Only use --worktree when launching from a git repo
    if find_git_root_at(&cwd).is_some() {
        claude_cmd.push_str(&format!(" --worktree {}", shell_escape(&session_name)));
    }
    if let Some(p) = prompt {
        claude_cmd.push_str(" -p ");
        claude_cmd.push_str(&shell_escape(p));
    }

    create_tmux_session(&session_name, &cwd, &claude_cmd)
}

pub fn resume_claude_session(name: &str, repo: Option<&str>) -> Result<()> {
    let cwd = match repo {
        Some(r) => r.to_string(),
        None => find_git_root().context("Not inside a git repository")?,
    };

    // Kill the dead tmux session first
    let _ = Command::new("tmux")
        .args(["kill-session", "-t", name])
        .output();

    let mut claude_cmd = String::from("claude --dangerously-skip-permissions --resume");
    if find_git_root_at(&cwd).is_some() {
        claude_cmd.push_str(&format!(" --worktree {}", shell_escape(name)));
    }

    create_tmux_session(name, &cwd, &claude_cmd)
}

pub fn kill_session(session_name: &str) -> Result<()> {
    hooks::clear_session_status(session_name);

    let output = Command::new("tmux")
        .args(["kill-session", "-t", session_name])
        .output()
        .context("Failed to kill tmux session")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("tmux kill-session failed: {}", stderr.trim());
    }

    Ok(())
}

fn create_tmux_session(session_name: &str, cwd: &str, shell_cmd: &str) -> Result<()> {
    let output = Command::new("tmux")
        .args([
            "new-session",
            "-d",
            "-s",
            session_name,
            "-c",
            cwd,
            "-x",
            "220",
            "-y",
            "50",
            "sh",
            "-c",
            shell_cmd,
        ])
        .output()
        .context("Failed to create tmux session")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("tmux new-session failed: {}", stderr.trim());
    }

    Command::new("tmux")
        .args(["set-option", "-t", session_name, "history-limit", "50000"])
        .output()
        .ok();

    Ok(())
}

pub fn prefixed_name(name: &str) -> String {
    let sanitized = sanitize_name(name);
    if sanitized.starts_with(SESSION_PREFIX) {
        sanitized
    } else {
        format!("{}{}", SESSION_PREFIX, sanitized)
    }
}

pub fn sanitize_name(name: &str) -> String {
    let s: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect();
    s.trim_matches('-').to_string()
}

fn find_git_root() -> Option<String> {
    find_git_root_at(".")
}

fn find_git_root_at(path: &str) -> Option<String> {
    let output = Command::new("git")
        .args(["-C", path, "rev-parse", "--show-toplevel"])
        .output()
        .ok()?;

    if output.status.success() {
        return Some(String::from_utf8_lossy(&output.stdout).trim().to_string());
    }

    None
}

pub fn shell_escape(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_alphanumeric_unchanged() {
        assert_eq!(sanitize_name("hello-world"), "hello-world");
    }

    #[test]
    fn sanitize_replaces_special_chars() {
        assert_eq!(sanitize_name("hello world!"), "hello-world");
    }

    #[test]
    fn sanitize_trims_leading_trailing_dashes() {
        assert_eq!(sanitize_name("--hello--"), "hello");
    }

    #[test]
    fn sanitize_preserves_underscores() {
        assert_eq!(sanitize_name("my_session"), "my_session");
    }

    #[test]
    fn sanitize_unicode_replaced() {
        // trailing dash from 'e' gets trimmed
        assert_eq!(sanitize_name("caf\u{e9}"), "caf");
    }

    #[test]
    fn sanitize_empty_string() {
        assert_eq!(sanitize_name(""), "");
    }

    #[test]
    fn sanitize_all_special_chars() {
        assert_eq!(sanitize_name("@#$%"), "");
    }

    #[test]
    fn prefixed_name_adds_prefix() {
        assert_eq!(prefixed_name("myapp"), "cc-myapp");
    }

    #[test]
    fn prefixed_name_does_not_double_prefix() {
        assert_eq!(prefixed_name("cc-myapp"), "cc-myapp");
    }

    #[test]
    fn prefixed_name_sanitizes_input() {
        assert_eq!(prefixed_name("my app!"), "cc-my-app");
    }

    #[test]
    fn shell_escape_simple_string() {
        assert_eq!(shell_escape("hello"), "'hello'");
    }

    #[test]
    fn shell_escape_with_single_quotes() {
        assert_eq!(shell_escape("it's"), "'it'\\''s'");
    }

    #[test]
    fn shell_escape_empty_string() {
        assert_eq!(shell_escape(""), "''");
    }

    #[test]
    fn shell_escape_with_spaces_and_special_chars() {
        assert_eq!(shell_escape("hello world $VAR"), "'hello world $VAR'");
    }
}
