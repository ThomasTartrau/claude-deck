use std::fs;
use std::path::PathBuf;

use crate::model::SessionStatus;

const HOOK_SCRIPT: &str = r#"#!/bin/sh
# Use user-owned cache dir (not /tmp) to prevent symlink attacks
if [ "$(uname)" = "Darwin" ]; then
    DIR="$HOME/Library/Caches/claude-deck/status"
else
    DIR="${XDG_CACHE_HOME:-$HOME/.cache}/claude-deck/status"
fi
LOG="${DIR}/../debug.log"
mkdir -p "$DIR"
S=$(tmux display-message -t "$TMUX_PANE" -p '#{session_name}' 2>/dev/null)
[ -z "$S" ] && exit 0
printf '[%s] session=%s status=%s\n' "$(date +%H:%M:%S)" "$S" "$1" >> "$LOG"
printf '%s' "$1" > "$DIR/$S"
"#;

const HOOK_MARKER: &str = "claude-deck-hook.sh";

pub fn status_dir() -> PathBuf {
    // Use a user-owned directory to prevent symlink attacks in world-writable /tmp
    dirs::cache_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join("claude-deck")
        .join("status")
}

pub fn status_file_path(session_name: &str) -> PathBuf {
    status_dir().join(session_name)
}

fn hook_script_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".claude")
        .join("claude-deck-hook.sh")
}

/// Read session status from the hook state file.
/// Returns None if no state file exists (hooks not yet active for this session).
pub fn read_session_status(session_name: &str) -> Option<SessionStatus> {
    let path = status_dir().join(session_name);
    fs::read_to_string(path).ok().map(|s| match s.trim() {
        "running" => SessionStatus::Running,
        "waiting" => SessionStatus::Waiting,
        _ => SessionStatus::Idle,
    })
}

/// Install the hook script and configure Claude Code settings.json.
/// Safe to call multiple times — skips if already installed.
pub fn ensure_hooks_installed() {
    let _ = fs::create_dir_all(status_dir());
    install_hook_script();
    configure_settings_hooks();
}

/// Remove the state file when a session is killed.
pub fn clear_session_status(session_name: &str) {
    let path = status_dir().join(session_name);
    let _ = fs::remove_file(path);
}

fn install_hook_script() {
    let path = hook_script_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(&path, HOOK_SCRIPT);

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o755));
    }
}

fn configure_settings_hooks() {
    let settings_path = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".claude")
        .join("settings.json");

    let mut settings: serde_json::Value = fs::read_to_string(&settings_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| serde_json::json!({}));

    let hooks = settings
        .as_object_mut()
        .unwrap()
        .entry("hooks")
        .or_insert_with(|| serde_json::json!({}));

    let hook_cmd = hook_script_path().to_string_lossy().to_string();

    // Hook format (v2): each event has an array of {matcher?, hooks: [{type, command}]}
    // - SessionStart -> idle (session just started)
    // - UserPromptSubmit -> running (user sent a message)
    // - Stop -> idle (Claude finished responding)
    // - Notification(*) -> idle (any notification = Claude back to prompt)
    // - Notification(permission_prompt) -> waiting (permission needed, overrides idle)
    let hook_events: [(&str, String, Option<&str>); 5] = [
        ("SessionStart", format!("{hook_cmd} idle"), None),
        ("UserPromptSubmit", format!("{hook_cmd} running"), None),
        ("Stop", format!("{hook_cmd} idle"), None),
        ("Notification", format!("{hook_cmd} idle"), Some("*")),
        (
            "Notification",
            format!("{hook_cmd} waiting"),
            Some("permission_prompt"),
        ),
    ];

    let mut changed = false;

    // Clean up old hooks with outdated matchers (e.g. idle_prompt -> *)
    if let Some(notif_arr) = hooks
        .as_object_mut()
        .and_then(|h| h.get_mut("Notification"))
        .and_then(|v| v.as_array_mut())
    {
        let before = notif_arr.len();
        notif_arr.retain(|entry| {
            let has_our_hook = entry
                .get("hooks")
                .and_then(|h| h.as_array())
                .map(|hooks_arr| {
                    hooks_arr.iter().any(|h| {
                        h.get("command")
                            .and_then(|c| c.as_str())
                            .map(|c| c.contains(HOOK_MARKER))
                            .unwrap_or(false)
                    })
                })
                .unwrap_or(false);
            // Remove our old hooks so they get re-installed with current matchers
            !has_our_hook
        });
        if notif_arr.len() != before {
            changed = true;
        }
    }

    for (event, command, matcher) in &hook_events {
        let event_hooks = hooks
            .as_object_mut()
            .unwrap()
            .entry(*event)
            .or_insert_with(|| serde_json::json!([]));

        let arr = match event_hooks.as_array_mut() {
            Some(a) => a,
            None => continue,
        };

        // Skip if our hook with the same matcher is already installed
        let already_installed = arr.iter().any(|entry| {
            let entry_matcher = entry.get("matcher").and_then(|m| m.as_str());
            let same_matcher = entry_matcher == *matcher;
            let has_our_hook = entry
                .get("hooks")
                .and_then(|h| h.as_array())
                .map(|hooks_arr| {
                    hooks_arr.iter().any(|h| {
                        h.get("command")
                            .and_then(|c| c.as_str())
                            .map(|c| c.contains(HOOK_MARKER))
                            .unwrap_or(false)
                    })
                })
                .unwrap_or(false);
            same_matcher && has_our_hook
        });

        if !already_installed {
            let mut entry = serde_json::json!({
                "hooks": [{
                    "type": "command",
                    "command": command
                }]
            });
            if let Some(m) = matcher {
                entry
                    .as_object_mut()
                    .unwrap()
                    .insert("matcher".into(), serde_json::json!(m));
            }
            arr.push(entry);
            changed = true;
        }
    }

    if changed {
        if let Ok(content) = serde_json::to_string_pretty(&settings) {
            let _ = fs::write(&settings_path, content);
        }
    }
}
