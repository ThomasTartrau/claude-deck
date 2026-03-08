use anyhow::Result;
use chrono::{DateTime, Local, TimeZone};

#[derive(Debug)]
pub struct TmuxSessionInfo {
    pub name: String,
    pub created: DateTime<Local>,
    pub pane_pid: Option<u32>,
    pub pane_current_path: Option<String>,
}

pub fn parse_session_line(line: &str) -> Result<TmuxSessionInfo> {
    // Format: name|created_epoch|pane_pid|pane_path
    let parts: Vec<&str> = line.split('|').collect();
    if parts.len() < 4 {
        anyhow::bail!("Invalid tmux format line: {}", line);
    }

    let name = parts[0].to_string();
    let created_epoch: i64 = parts[1].parse().unwrap_or(0);
    let created = Local
        .timestamp_opt(created_epoch, 0)
        .single()
        .unwrap_or_else(Local::now);
    let pane_pid = parts[2].parse::<u32>().ok();
    let pane_current_path = if parts[3].is_empty() {
        None
    } else {
        Some(parts[3].trim().to_string())
    };

    Ok(TmuxSessionInfo {
        name,
        created,
        pane_pid,
        pane_current_path,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_valid_line() {
        let line = "cc-myapp|1700000000|12345|/home/user/project";
        let info = parse_session_line(line).unwrap();
        assert_eq!(info.name, "cc-myapp");
        assert_eq!(info.pane_pid, Some(12345));
        assert_eq!(
            info.pane_current_path.as_deref(),
            Some("/home/user/project")
        );
    }

    #[test]
    fn parse_empty_pid_and_path() {
        let line = "cc-test|1700000000||";
        let info = parse_session_line(line).unwrap();
        assert_eq!(info.name, "cc-test");
        assert_eq!(info.pane_pid, None);
        assert_eq!(info.pane_current_path, None);
    }

    #[test]
    fn parse_too_few_fields() {
        let line = "cc-test|1700000000";
        assert!(parse_session_line(line).is_err());
    }

    #[test]
    fn parse_extra_fields_ignored() {
        let line = "cc-test|1700000000|999|/tmp|extra|fields";
        let info = parse_session_line(line).unwrap();
        assert_eq!(info.name, "cc-test");
        assert_eq!(info.pane_pid, Some(999));
        assert_eq!(info.pane_current_path.as_deref(), Some("/tmp"));
    }

    #[test]
    fn parse_invalid_epoch_defaults_to_zero() {
        let line = "cc-test|not_a_number|100|/tmp";
        let info = parse_session_line(line).unwrap();
        // Should not panic; epoch defaults to 0
        assert_eq!(info.name, "cc-test");
        assert_eq!(info.pane_pid, Some(100));
    }

    #[test]
    fn parse_whitespace_in_path_trimmed() {
        let line = "cc-test|1700000000|100|  /home/user  ";
        let info = parse_session_line(line).unwrap();
        assert_eq!(info.pane_current_path.as_deref(), Some("/home/user"));
    }
}
