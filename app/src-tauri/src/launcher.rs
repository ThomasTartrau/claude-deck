use claude_deck_core::claude::hooks;
use claude_deck_core::claude::launcher as core_launcher;
use claude_deck_core::config;

/// Launch a new claude session in tmux.
pub fn launch_session(
    name: String,
    prompt: Option<String>,
    path: Option<String>,
) -> Result<String, String> {
    let session_name = core_launcher::prefixed_name(&name);
    let pane_path = path.clone().unwrap_or_else(|| ".".to_string());
    core_launcher::launch_claude_session(&name, prompt.as_deref(), path.as_deref())
        .map_err(|e| format!("Failed to launch session: {}", e))?;

    // Persist session for restore after reboot
    let mut saved = config::load_saved_sessions();
    if !saved.iter().any(|s| s.name == session_name) {
        saved.push(config::SavedSession {
            name: session_name.clone(),
            path: pane_path,
        });
        config::save_sessions(&saved);
    }

    Ok(session_name)
}

/// Kill a session and clean up its status file.
pub fn kill_session(name: String) -> Result<(), String> {
    core_launcher::kill_session(&name).map_err(|e| format!("Failed to kill session: {}", e))?;

    // Remove from persisted sessions
    let mut saved = config::load_saved_sessions();
    saved.retain(|s| s.name != name);
    config::save_sessions(&saved);

    Ok(())
}

/// Resume a session by killing the old one and launching with --resume.
pub fn resume_session(name: String, path: Option<String>) -> Result<String, String> {
    let session_name = core_launcher::prefixed_name(&name);

    // Kill existing session if it exists (ignore errors)
    let _ = core_launcher::kill_session(&session_name);
    hooks::clear_session_status(&session_name);

    core_launcher::resume_claude_session(&session_name, path.as_deref())
        .map_err(|e| format!("Failed to resume session: {}", e))?;
    Ok(session_name)
}
