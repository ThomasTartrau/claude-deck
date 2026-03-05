use std::process::Command;

use anyhow::{Context, Result};

pub fn run_tmux(args: &[&str]) -> Result<String> {
    let output = Command::new("tmux")
        .args(args)
        .output()
        .context("Failed to execute tmux command")?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("tmux error: {}", stderr.trim())
    }
}

pub fn run_tmux_allow_failure(args: &[&str]) -> Option<String> {
    Command::new("tmux")
        .args(args)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
}

pub fn send_keys(session: &str, text: &str) -> Result<()> {
    run_tmux(&["send-keys", "-t", session, "-l", text])?;
    run_tmux(&["send-keys", "-t", session, "Enter"])?;
    Ok(())
}

pub fn rename_session(old: &str, new: &str) -> Result<()> {
    run_tmux(&["rename-session", "-t", old, new])?;
    Ok(())
}

pub fn attach_session(name: &str) -> Result<std::process::ExitStatus> {
    Command::new("tmux")
        .args(["attach-session", "-t", name])
        .stdin(std::process::Stdio::inherit())
        .stdout(std::process::Stdio::inherit())
        .stderr(std::process::Stdio::inherit())
        .status()
        .context("Failed to attach to tmux session")
}
