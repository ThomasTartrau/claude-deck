use std::env;
use std::process::Command;

use anyhow::{Context, Result};

use super::hooks;

pub const SESSION_PREFIX: &str = "cc-";

pub fn launch_claude_session(name: &str, prompt: Option<&str>, repo: Option<&str>) -> Result<()> {
    let session_name = prefixed_name(name);
    let cwd = resolve_cwd(repo);

    let mut claude_cmd = String::from("claude --dangerously-skip-permissions");
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
    let cwd = resolve_cwd(repo);

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
    // Use the user's login shell so the full PATH (with psql, cargo, etc.) is loaded.
    // GUI apps on macOS don't inherit shell PATH, so `sh -c` would miss binaries.
    let login_shell = env::var("SHELL").unwrap_or_else(|_| "bash".to_string());
    // Collect all CLAUDE* env var names to unset inside the tmux shell command.
    // env_remove on Command doesn't work here because tmux runs the command on
    // its server process, which inherits the parent environment independently.
    let claude_vars: Vec<String> = env::vars()
        .filter(|(k, _)| k.starts_with("CLAUDE"))
        .map(|(k, _)| k)
        .collect();
    let unset_prefix = if claude_vars.is_empty() {
        String::new()
    } else {
        format!("unset {}; ", claude_vars.join(" "))
    };
    let wrapped = format!(
        "{}exec {} -lc {}",
        unset_prefix,
        login_shell,
        shell_escape(shell_cmd)
    );
    // Force UTF-8 so tmux renders Unicode characters correctly.
    // GUI apps (Tauri / Homebrew) don't inherit the shell's LANG.
    let output = Command::new("tmux")
        .env("LANG", "en_US.UTF-8")
        .env("LC_CTYPE", "en_US.UTF-8")
        .args([
            "-u",
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
            &wrapped,
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

fn resolve_cwd(repo: Option<&str>) -> String {
    match repo {
        Some(r) => expand_tilde(r),
        None => find_git_root()
            .or_else(|| {
                env::current_dir()
                    .map(|p| p.to_string_lossy().to_string())
                    .ok()
            })
            .unwrap_or_else(|| ".".to_string()),
    }
}

fn expand_tilde(path: &str) -> String {
    if path.starts_with("~/") {
        dirs::home_dir()
            .map(|h| h.join(&path[2..]).to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string())
    } else {
        path.to_string()
    }
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
