mod launcher;
mod pty;
mod session;

use claude_deck_core::claude::hooks;
use claude_deck_core::config::{Config, QuickAction};
use claude_deck_core::tmux::command as tmux_cmd;
use session::SessionInfo;

#[tauri::command]
async fn list_sessions() -> Result<Vec<SessionInfo>, String> {
    tauri::async_runtime::spawn_blocking(session::list_sessions)
        .await
        .map_err(|e| format!("Failed to list sessions: {}", e))
}

#[tauri::command]
fn launch_session(
    name: String,
    prompt: Option<String>,
    path: Option<String>,
) -> Result<String, String> {
    launcher::launch_session(name, prompt, path)
}

#[tauri::command]
fn kill_session(name: String) -> Result<(), String> {
    launcher::kill_session(name)
}

#[tauri::command]
fn resume_session(name: String, path: Option<String>) -> Result<String, String> {
    launcher::resume_session(name, path)
}

#[tauri::command]
fn send_prompt(name: String, text: String) -> Result<(), String> {
    if name.is_empty() || text.is_empty() {
        return Err("Name and text are required".to_string());
    }
    // Validate session name contains only safe characters (no : or . that could target other panes)
    if !name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Invalid session name".to_string());
    }
    tmux_cmd::send_keys(&name, &text).map_err(|e| format!("Failed to send keys: {}", e))
}

#[tauri::command]
fn rename_session(old_name: String, new_name: String) -> Result<(), String> {
    tmux_cmd::rename_session(&old_name, &new_name).map_err(|e| {
        format!(
            "Failed to rename session {} to {}: {}",
            old_name, new_name, e
        )
    })?;

    // Update tags in config
    let mut config = Config::load();
    let tags = config.tags_for(&old_name);
    if !tags.is_empty() {
        config.set_tags(&old_name, vec![]);
        config.set_tags(&new_name, tags);
        config.save();
    }

    Ok(())
}

#[tauri::command]
fn get_config() -> Config {
    Config::load()
}

#[tauri::command]
fn set_tags(session_name: String, tags: Vec<String>) -> Result<(), String> {
    let mut config = Config::load();
    config.set_tags(&session_name, tags);
    config.save();
    Ok(())
}

#[tauri::command]
fn get_all_tags() -> Vec<String> {
    Config::load().all_tags()
}

#[tauri::command]
fn attach_session(name: String) -> Result<(), String> {
    use claude_deck_core::claude::launcher::sanitize_name;

    // Sanitize to [a-zA-Z0-9_-] only — prevents injection in both AppleScript and shell
    let sanitized = sanitize_name(&name);
    if sanitized.is_empty() {
        return Err("Invalid session name".to_string());
    }

    let script = format!(
        r#"tell application "Terminal"
            activate
            do script "tmux attach-session -t {}"
        end tell"#,
        sanitized
    );
    let result = std::process::Command::new("osascript")
        .args(["-e", &script])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    if result {
        Ok(())
    } else {
        Err("Failed to attach to session".to_string())
    }
}

#[tauri::command]
fn pty_open(
    app_handle: tauri::AppHandle,
    session_name: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    pty::open(app_handle, &session_name, cols, rows)
}

#[tauri::command]
fn pty_write(data: String) -> Result<(), String> {
    pty::write_data(data.as_bytes())
}

#[tauri::command]
fn pty_resize(cols: u16, rows: u16) -> Result<(), String> {
    pty::resize(cols, rows)
}

#[tauri::command]
fn pty_close() {
    pty::close();
}

#[tauri::command]
fn ensure_hooks() -> Result<(), String> {
    hooks::ensure_hooks_installed();
    Ok(())
}

#[tauri::command]
fn add_workspace(path: String) -> Result<(), String> {
    let expanded = if path.starts_with("~/") {
        dirs::home_dir()
            .map(|h| h.join(&path[2..]).to_string_lossy().to_string())
            .unwrap_or(path.clone())
    } else {
        path.clone()
    };

    let canonical = std::fs::canonicalize(&expanded)
        .map_err(|_| format!("Directory not found: {}", expanded))?;

    if !canonical.is_dir() {
        return Err(format!("Not a directory: {}", canonical.display()));
    }

    let name = canonical
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "workspace".to_string());

    let mut config = Config::load();
    config.add_workspace(name, canonical.to_string_lossy().to_string());
    config.save();
    Ok(())
}

#[tauri::command]
fn remove_workspace(path: String) -> Result<(), String> {
    let mut config = Config::load();
    config.remove_workspace_by_path(&path);
    config.save();
    Ok(())
}

#[tauri::command]
fn get_quick_actions() -> Vec<QuickAction> {
    let config = Config::load();
    config.quick_actions
}

#[tauri::command]
fn save_quick_action(
    key: String,
    label: String,
    prompt: String,
    edit_index: Option<usize>,
) -> Result<(), String> {
    let mut config = Config::load();
    let action = QuickAction { key, label, prompt };
    match edit_index {
        Some(idx) if idx < config.quick_actions.len() => config.quick_actions[idx] = action,
        _ => config.quick_actions.push(action),
    }
    config.save();
    Ok(())
}

#[tauri::command]
fn delete_quick_action(index: usize) -> Result<(), String> {
    let mut config = Config::load();
    if index < config.quick_actions.len() {
        config.quick_actions.remove(index);
        config.save();
    }
    Ok(())
}

#[tauri::command]
fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    claude_deck_core::ensure_path();

    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_sessions,
            launch_session,
            kill_session,
            resume_session,
            send_prompt,
            rename_session,
            get_config,
            set_tags,
            get_all_tags,
            attach_session,
            pty_open,
            pty_write,
            pty_resize,
            pty_close,
            ensure_hooks,
            add_workspace,
            remove_workspace,
            get_quick_actions,
            save_quick_action,
            delete_quick_action,
            get_version,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
