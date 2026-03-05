use super::launcher::SESSION_PREFIX;

pub fn is_claude_session(session_name: &str, pane_command: Option<&str>) -> bool {
    if session_name.starts_with(SESSION_PREFIX) {
        return true;
    }
    if let Some(cmd) = pane_command {
        return cmd == "claude";
    }
    false
}
