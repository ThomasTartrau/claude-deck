mod launcher;
mod pty;
mod session;

use claude_deck_core::claude::hooks;
use claude_deck_core::config::{Config, QuickAction};
use claude_deck_core::tmux::command as tmux_cmd;
use serde::Serialize;
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

#[derive(Debug, Clone, Serialize)]
struct DiffFile {
    path: String,
    old_path: Option<String>,
    status: String, // "M", "A", "D", "R", "?"
    insertions: u32,
    deletions: u32,
}

#[derive(Debug, Clone, Serialize)]
struct SessionDiff {
    staged_files: Vec<DiffFile>,
    unstaged_files: Vec<DiffFile>,
    untracked_files: Vec<DiffFile>,
    staged_diff: String,
    unstaged_diff: String,
    untracked_diff: String,
}

/// Resolve a session name to its working directory.
fn resolve_session_cwd(sessions: &[SessionInfo], name: &str) -> Result<String, String> {
    let session = sessions
        .iter()
        .find(|s| s.name == name)
        .ok_or_else(|| format!("Session '{}' not found", name))?;
    session
        .pane_path
        .as_deref()
        .ok_or("Session has no working directory".to_string())
        .map(|s| s.to_string())
}

/// Parse `git diff --numstat` + `git diff --name-status` into DiffFile entries.
fn parse_diff_files(numstat: &str, name_status: &str) -> Vec<DiffFile> {
    let mut status_map = std::collections::HashMap::new();
    for line in name_status.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() >= 2 {
            let status = if parts[0].starts_with('R') {
                "R"
            } else {
                parts[0]
            };
            let path = if parts.len() >= 3 { parts[2] } else { parts[1] };
            let old_path = if parts.len() >= 3 {
                Some(parts[1].to_string())
            } else {
                None
            };
            status_map.insert(path.to_string(), (status.to_string(), old_path));
        }
    }

    let mut files = Vec::new();
    for line in numstat.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() >= 3 {
            let insertions = parts[0].parse::<u32>().unwrap_or(0);
            let deletions = parts[1].parse::<u32>().unwrap_or(0);
            let path = parts.last().unwrap_or(&"").to_string();
            let (status, old_path) = status_map.remove(&path).unwrap_or(("M".to_string(), None));
            files.push(DiffFile {
                path,
                old_path,
                status,
                insertions,
                deletions,
            });
        }
    }
    files
}

/// Build a synthetic unified diff for untracked files.
fn build_untracked_diff(cwd: &str, paths: &[String]) -> (Vec<DiffFile>, String) {
    let mut files = Vec::new();
    let mut diff = String::new();
    for path in paths {
        let file_path = std::path::Path::new(cwd).join(path);
        if let Ok(content) = std::fs::read_to_string(&file_path) {
            let line_count = content.lines().count() as u32;
            files.push(DiffFile {
                path: path.clone(),
                old_path: None,
                status: "?".to_string(),
                insertions: line_count,
                deletions: 0,
            });
            diff.push_str(&format!("diff --git a/{0} b/{0}\n", path));
            diff.push_str("new file mode 100644\n");
            diff.push_str(&format!("--- /dev/null\n+++ b/{}\n", path));
            let lines: Vec<&str> = content.lines().collect();
            diff.push_str(&format!("@@ -0,0 +1,{} @@\n", lines.len()));
            for l in &lines {
                diff.push('+');
                diff.push_str(l);
                diff.push('\n');
            }
        }
    }
    (files, diff)
}

#[tauri::command]
async fn get_session_diff(session_name: String) -> Result<SessionDiff, String> {
    let sessions = tauri::async_runtime::spawn_blocking(session::list_sessions)
        .await
        .map_err(|e| format!("Failed to list sessions: {}", e))?;
    let cwd = resolve_session_cwd(&sessions, &session_name)?;

    tauri::async_runtime::spawn_blocking(move || {
        let git = |args: &[&str]| -> Result<String, String> {
            let out = std::process::Command::new("git")
                .args(args)
                .current_dir(&cwd)
                .output()
                .map_err(|e| format!("git error: {}", e))?;
            Ok(String::from_utf8_lossy(&out.stdout).to_string())
        };

        // Staged
        let staged_numstat = git(&["diff", "--cached", "--numstat", "--find-renames"])?;
        let staged_name_status = git(&["diff", "--cached", "--name-status", "--find-renames"])?;
        let staged_diff = git(&["diff", "--cached", "--find-renames"])?;
        let staged_files = parse_diff_files(&staged_numstat, &staged_name_status);

        // Unstaged
        let unstaged_numstat = git(&["diff", "--numstat", "--find-renames"])?;
        let unstaged_name_status = git(&["diff", "--name-status", "--find-renames"])?;
        let unstaged_diff = git(&["diff", "--find-renames"])?;
        let unstaged_files = parse_diff_files(&unstaged_numstat, &unstaged_name_status);

        // Untracked
        let untracked_raw = git(&["ls-files", "--others", "--exclude-standard"])?;
        let untracked_paths: Vec<String> = untracked_raw
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .collect();
        let (untracked_files, untracked_diff) = build_untracked_diff(&cwd, &untracked_paths);

        Ok(SessionDiff {
            staged_files,
            unstaged_files,
            untracked_files,
            staged_diff,
            unstaged_diff,
            untracked_diff,
        })
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

// ── Git staging commands ────────────────────────────────────────────

/// Run a git command in a session's working directory.
fn git_in_session(session_name: &str, args: &[&str]) -> Result<String, String> {
    let sessions = session::list_sessions();
    let cwd = resolve_session_cwd(&sessions, session_name)?;
    let out = std::process::Command::new("git")
        .args(args)
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("git error: {}", e))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).to_string())
    }
}

#[tauri::command]
fn git_stage_file(session_name: String, path: String) -> Result<(), String> {
    git_in_session(&session_name, &["add", "--", &path])?;
    Ok(())
}

#[tauri::command]
fn git_unstage_file(session_name: String, path: String) -> Result<(), String> {
    git_in_session(&session_name, &["reset", "HEAD", "--", &path])?;
    Ok(())
}

#[tauri::command]
fn git_discard_file(session_name: String, path: String) -> Result<(), String> {
    // Check if file is untracked
    let sessions = session::list_sessions();
    let cwd = resolve_session_cwd(&sessions, &session_name)?;
    let status_out = std::process::Command::new("git")
        .args(["status", "--porcelain", "--", &path])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("git error: {}", e))?;
    let status_str = String::from_utf8_lossy(&status_out.stdout);
    let is_untracked = status_str.trim_start().starts_with("??");

    if is_untracked {
        // Remove untracked file
        let file_path = std::path::Path::new(&cwd).join(&path);
        std::fs::remove_file(&file_path).map_err(|e| format!("Failed to remove file: {}", e))?;
    } else {
        // Restore tracked file
        git_in_session(&session_name, &["checkout", "HEAD", "--", &path])?;
    }
    Ok(())
}

#[tauri::command]
fn git_stage_lines(
    session_name: String,
    path: String,
    hunk_index: usize,
    line_indices: Vec<usize>,
) -> Result<(), String> {
    let sessions = session::list_sessions();
    let cwd = resolve_session_cwd(&sessions, &session_name)?;

    let out = std::process::Command::new("git")
        .args(["diff", "--", &path])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("git error: {}", e))?;
    let full_diff = String::from_utf8_lossy(&out.stdout);

    let patch = build_partial_patch(&full_diff, hunk_index, &line_indices)?;
    apply_patch(&cwd, &patch, &["--cached"])
}

#[tauri::command]
fn git_discard_lines(
    session_name: String,
    path: String,
    hunk_index: usize,
    line_indices: Vec<usize>,
) -> Result<(), String> {
    let sessions = session::list_sessions();
    let cwd = resolve_session_cwd(&sessions, &session_name)?;

    let out = std::process::Command::new("git")
        .args(["diff", "--", &path])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("git error: {}", e))?;
    let full_diff = String::from_utf8_lossy(&out.stdout);

    let patch = build_partial_patch(&full_diff, hunk_index, &line_indices)?;
    apply_patch(&cwd, &patch, &["--reverse"])
}

#[tauri::command]
fn git_unstage_lines(
    session_name: String,
    path: String,
    hunk_index: usize,
    line_indices: Vec<usize>,
) -> Result<(), String> {
    let sessions = session::list_sessions();
    let cwd = resolve_session_cwd(&sessions, &session_name)?;

    // Use the staged diff (--cached) to build the patch
    let out = std::process::Command::new("git")
        .args(["diff", "--cached", "--", &path])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("git error: {}", e))?;
    let full_diff = String::from_utf8_lossy(&out.stdout);

    let patch = build_partial_patch(&full_diff, hunk_index, &line_indices)?;
    // Reverse-apply to the index to unstage
    apply_patch(&cwd, &patch, &["--cached", "--reverse"])
}

/// Pipe a patch into `git apply` with extra flags.
fn apply_patch(cwd: &str, patch: &str, extra_args: &[&str]) -> Result<(), String> {
    let mut args = vec!["apply"];
    args.extend_from_slice(extra_args);

    let mut child = std::process::Command::new("git")
        .args(&args)
        .current_dir(cwd)
        .stdin(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn git apply: {}", e))?;

    if let Some(stdin) = child.stdin.as_mut() {
        use std::io::Write;
        stdin
            .write_all(patch.as_bytes())
            .map_err(|e| format!("Failed to write patch: {}", e))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("git apply failed: {}", e))?;
    if !output.status.success() {
        return Err(format!(
            "git apply failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(())
}

/// Build a partial patch containing only selected lines from a specific hunk.
///
/// `line_indices` are 0-based indices into the hunk's diff lines (excluding the
/// @@ header), counting only +/- lines (not context lines).
///
/// Selected `+` lines are kept as `+`, selected `-` lines are kept as `-`.
/// Unselected `+` lines are removed from the patch entirely.
/// Unselected `-` lines are converted to context lines.
fn build_partial_patch(
    full_diff: &str,
    hunk_index: usize,
    line_indices: &[usize],
) -> Result<String, String> {
    let mut file_header = String::new();
    let mut hunks: Vec<Vec<String>> = Vec::new();
    let mut current_lines: Vec<String> = Vec::new();
    let mut hunk_headers: Vec<String> = Vec::new();

    for line in full_diff.lines() {
        if line.starts_with("diff --git ")
            || line.starts_with("index ")
            || line.starts_with("--- ")
            || line.starts_with("+++ ")
            || line.starts_with("old mode ")
            || line.starts_with("new mode ")
            || line.starts_with("new file mode ")
            || line.starts_with("deleted file mode ")
        {
            file_header.push_str(line);
            file_header.push('\n');
            continue;
        }

        if line.starts_with("@@") {
            if !current_lines.is_empty() {
                hunks.push(current_lines.clone());
            }
            current_lines = Vec::new();
            hunk_headers.push(line.to_string());
            continue;
        }

        if !hunk_headers.is_empty() {
            current_lines.push(line.to_string());
        }
    }
    if !current_lines.is_empty() {
        hunks.push(current_lines);
    }

    if hunk_index >= hunks.len() {
        return Err(format!(
            "Hunk index {} out of range (file has {} hunks)",
            hunk_index,
            hunks.len()
        ));
    }

    let selected: std::collections::HashSet<usize> = line_indices.iter().copied().collect();
    let hunk_lines = &hunks[hunk_index];

    // Build filtered lines and recalculate counts
    let mut filtered_lines: Vec<String> = Vec::new();
    let mut change_idx: usize = 0; // index counting only +/- lines
    let mut old_count: u32 = 0;
    let mut new_count: u32 = 0;

    for line in hunk_lines {
        if line.starts_with('+') {
            if selected.contains(&change_idx) {
                filtered_lines.push(line.clone());
                new_count += 1;
            }
            // Unselected `+` → omit entirely
            change_idx += 1;
        } else if let Some(content) = line.strip_prefix('-') {
            if selected.contains(&change_idx) {
                filtered_lines.push(line.clone());
                old_count += 1;
            } else {
                // Unselected `-` → convert to context
                filtered_lines.push(format!(" {}", content));
                old_count += 1;
                new_count += 1;
            }
            change_idx += 1;
        } else {
            // Context line
            filtered_lines.push(line.clone());
            old_count += 1;
            new_count += 1;
        }
    }

    if filtered_lines.is_empty() {
        return Err("No lines selected".to_string());
    }

    // Parse original hunk header to get old_start, new_start
    let orig_header = &hunk_headers[hunk_index];
    let re_hunk = regex::Regex::new(r"^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$")
        .map_err(|e| format!("regex error: {}", e))?;
    let caps = re_hunk
        .captures(orig_header)
        .ok_or("Failed to parse hunk header")?;
    let old_start: u32 = caps[1].parse().unwrap_or(1);
    let new_start: u32 = caps[2].parse().unwrap_or(1);
    let trailing = caps.get(3).map(|m| m.as_str()).unwrap_or("");

    let new_header = format!(
        "@@ -{},{} +{},{} @@{}",
        old_start, old_count, new_start, new_count, trailing
    );

    let mut patch = file_header;
    patch.push_str(&new_header);
    patch.push('\n');
    for l in &filtered_lines {
        patch.push_str(l);
        patch.push('\n');
    }

    Ok(patch)
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
            get_session_diff,
            git_stage_file,
            git_unstage_file,
            git_discard_file,
            git_stage_lines,
            git_unstage_lines,
            git_discard_lines,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
