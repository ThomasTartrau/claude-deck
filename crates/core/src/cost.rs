use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

#[derive(Debug, Clone, Default)]
pub struct CostInfo {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_creation_tokens: u64,
    pub cache_read_tokens: u64,
    pub total_cost: Option<f64>,
}

impl CostInfo {
    pub fn total_tokens(&self) -> u64 {
        self.input_tokens + self.output_tokens + self.cache_creation_tokens + self.cache_read_tokens
    }

    pub fn cost_display(&self) -> String {
        match self.total_cost {
            Some(c) if c >= 1.0 => format!("${:.2}", c),
            Some(c) if c > 0.0 => format!("${:.3}", c),
            Some(_) => "$0".to_string(),
            None => "-".to_string(),
        }
    }

    pub fn tokens_display(&self) -> String {
        let t = self.total_tokens();
        if t == 0 {
            return "-".to_string();
        }
        if t >= 1_000_000 {
            format!("{:.1}M", t as f64 / 1_000_000.0)
        } else if t >= 1_000 {
            format!("{:.1}k", t as f64 / 1_000.0)
        } else {
            format!("{}", t)
        }
    }
}

/// Pricing per token for Claude models (USD per token).
/// Based on Anthropic API pricing (opus-4).
pub struct ModelPricing {
    pub input_per_token: f64,
    pub output_per_token: f64,
    pub cache_write_per_token: f64,
    pub cache_read_per_token: f64,
}

pub const OPUS_PRICING: ModelPricing = ModelPricing {
    input_per_token: 15.0 / 1_000_000.0,
    output_per_token: 75.0 / 1_000_000.0,
    cache_write_per_token: 18.75 / 1_000_000.0,
    cache_read_per_token: 1.50 / 1_000_000.0,
};

pub const SONNET_PRICING: ModelPricing = ModelPricing {
    input_per_token: 3.0 / 1_000_000.0,
    output_per_token: 15.0 / 1_000_000.0,
    cache_write_per_token: 3.75 / 1_000_000.0,
    cache_read_per_token: 0.30 / 1_000_000.0,
};

pub const HAIKU_PRICING: ModelPricing = ModelPricing {
    input_per_token: 0.80 / 1_000_000.0,
    output_per_token: 4.0 / 1_000_000.0,
    cache_write_per_token: 1.0 / 1_000_000.0,
    cache_read_per_token: 0.08 / 1_000_000.0,
};

pub fn pricing_for_model(model: &str) -> &'static ModelPricing {
    if model.contains("opus") {
        &OPUS_PRICING
    } else if model.contains("haiku") {
        &HAIKU_PRICING
    } else {
        &SONNET_PRICING
    }
}

pub fn calculate_cost(info: &CostInfo, pricing: &ModelPricing) -> f64 {
    info.input_tokens as f64 * pricing.input_per_token
        + info.output_tokens as f64 * pricing.output_per_token
        + info.cache_creation_tokens as f64 * pricing.cache_write_per_token
        + info.cache_read_tokens as f64 * pricing.cache_read_per_token
}

/// Convert a working directory path to the Claude projects directory name.
/// `/Users/thomas/myproject` -> `-Users-thomas-myproject`
/// `/Users/thomas/.claude/worktrees/x` -> `-Users-thomas--claude-worktrees-x`
/// Both `/` and `.` are replaced with `-`.
pub fn path_to_project_dir(path: &str) -> String {
    path.chars()
        .map(|c| if c == '/' || c == '.' { '-' } else { c })
        .collect()
}

/// Find the most recent .jsonl session file for a given project directory.
pub fn find_latest_session_file(project_dir: &str) -> Option<PathBuf> {
    let claude_dir = dirs::home_dir()?
        .join(".claude")
        .join("projects")
        .join(project_dir);

    if !claude_dir.is_dir() {
        return None;
    }

    fs::read_dir(&claude_dir)
        .ok()?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().is_some_and(|ext| ext == "jsonl"))
        .max_by_key(|e| e.metadata().ok().and_then(|m| m.modified().ok()))
        .map(|e| e.path())
}

/// Return the mtime and path of the latest session JSONL for a given pane path.
pub fn session_file_mtime(pane_path: &str) -> Option<(std::time::SystemTime, PathBuf)> {
    let project_dir = path_to_project_dir(pane_path);
    let file = find_latest_session_file(&project_dir)?;
    let mtime = fs::metadata(&file).ok()?.modified().ok()?;
    Some((mtime, file))
}

/// Parse cost info from a JSONL file path.
pub fn parse_cost_from_file(path: &std::path::Path) -> CostInfo {
    parse_jsonl_file(path)
}

/// Parse cost info from Claude Code's session JSONL files.
///
/// Claude stores session data in `~/.claude/projects/<project-dir>/<session-id>.jsonl`.
/// Each assistant message contains a `usage` field with token counts.
pub fn parse_cost_from_session(pane_path: &str) -> CostInfo {
    let project_dir = path_to_project_dir(pane_path);
    let file = match find_latest_session_file(&project_dir) {
        Some(f) => f,
        None => return CostInfo::default(),
    };

    parse_jsonl_file(&file)
}

pub fn parse_jsonl_file(path: &std::path::Path) -> CostInfo {
    let file = match fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return CostInfo::default(),
    };

    let reader = BufReader::new(file);
    let mut info = CostInfo::default();
    let mut model = String::new();

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };

        // Fast check before JSON parsing
        if !line.contains("\"usage\"") {
            // Still check for model on assistant messages
            if model.is_empty() && line.contains("\"model\"") {
                if let Some(m) = extract_json_string(&line, "model") {
                    model = m;
                }
            }
            continue;
        }

        if let Some(usage) = extract_usage(&line) {
            info.input_tokens += usage.input;
            info.output_tokens += usage.output;
            info.cache_creation_tokens += usage.cache_creation;
            info.cache_read_tokens += usage.cache_read;
        }

        if model.is_empty() {
            if let Some(m) = extract_json_string(&line, "model") {
                model = m;
            }
        }
    }

    if info.total_tokens() > 0 {
        let pricing = pricing_for_model(&model);
        info.total_cost = Some(calculate_cost(&info, pricing));
    }

    info
}

pub struct UsageTokens {
    pub input: u64,
    pub output: u64,
    pub cache_creation: u64,
    pub cache_read: u64,
}

/// Extract usage tokens from a JSONL line without full JSON parsing.
pub fn extract_usage(line: &str) -> Option<UsageTokens> {
    let usage_start = line.find("\"usage\"")?;
    let rest = &line[usage_start..];
    let brace_start = rest.find('{')?;
    let brace_end = find_matching_brace(&rest[brace_start..])?;
    let usage_str = &rest[brace_start..brace_start + brace_end + 1];

    Some(UsageTokens {
        input: extract_json_u64(usage_str, "input_tokens").unwrap_or(0),
        output: extract_json_u64(usage_str, "output_tokens").unwrap_or(0),
        cache_creation: extract_json_u64(usage_str, "cache_creation_input_tokens").unwrap_or(0),
        cache_read: extract_json_u64(usage_str, "cache_read_input_tokens").unwrap_or(0),
    })
}

pub fn find_matching_brace(s: &str) -> Option<usize> {
    let mut depth = 0;
    for (i, c) in s.chars().enumerate() {
        match c {
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(i);
                }
            }
            _ => {}
        }
    }
    None
}

pub fn extract_json_u64(s: &str, key: &str) -> Option<u64> {
    let pattern = format!("\"{}\"", key);
    let pos = s.find(&pattern)?;
    let after = &s[pos + pattern.len()..];
    // Skip whitespace and colon
    let num_start = after.find(|c: char| c.is_ascii_digit())?;
    let num_str: String = after[num_start..]
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .collect();
    num_str.parse().ok()
}

pub fn extract_json_string(s: &str, key: &str) -> Option<String> {
    let pattern = format!("\"{}\"", key);
    let pos = s.find(&pattern)?;
    let after = &s[pos + pattern.len()..];
    // Find the opening quote after colon
    let quote_start = after.find('"')?;
    let rest = &after[quote_start + 1..];
    let quote_end = rest.find('"')?;
    Some(rest[..quote_end].to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cost_display_large() {
        let c = CostInfo {
            total_cost: Some(2.5),
            ..Default::default()
        };
        assert_eq!(c.cost_display(), "$2.50");
    }

    #[test]
    fn cost_display_small() {
        let c = CostInfo {
            total_cost: Some(0.045),
            ..Default::default()
        };
        assert_eq!(c.cost_display(), "$0.045");
    }

    #[test]
    fn cost_display_zero() {
        let c = CostInfo {
            total_cost: Some(0.0),
            ..Default::default()
        };
        assert_eq!(c.cost_display(), "$0");
    }

    #[test]
    fn cost_display_none() {
        let c = CostInfo::default();
        assert_eq!(c.cost_display(), "-");
    }

    #[test]
    fn tokens_display_millions() {
        let c = CostInfo {
            input_tokens: 1_500_000,
            ..Default::default()
        };
        assert_eq!(c.tokens_display(), "1.5M");
    }

    #[test]
    fn tokens_display_thousands() {
        let c = CostInfo {
            output_tokens: 12_500,
            ..Default::default()
        };
        assert_eq!(c.tokens_display(), "12.5k");
    }

    #[test]
    fn tokens_display_small() {
        let c = CostInfo {
            input_tokens: 500,
            ..Default::default()
        };
        assert_eq!(c.tokens_display(), "500");
    }

    #[test]
    fn tokens_display_none() {
        let c = CostInfo::default();
        assert_eq!(c.tokens_display(), "-");
    }

    #[test]
    fn total_tokens_sums_all() {
        let c = CostInfo {
            input_tokens: 100,
            output_tokens: 200,
            cache_creation_tokens: 300,
            cache_read_tokens: 400,
            total_cost: None,
        };
        assert_eq!(c.total_tokens(), 1000);
    }

    #[test]
    fn path_to_project_dir_basic() {
        assert_eq!(
            path_to_project_dir("/Users/thomas/myproject"),
            "-Users-thomas-myproject"
        );
    }

    #[test]
    fn path_to_project_dir_nested() {
        assert_eq!(path_to_project_dir("/home/user/a/b/c"), "-home-user-a-b-c");
    }

    #[test]
    fn path_to_project_dir_with_dots() {
        assert_eq!(
            path_to_project_dir("/Users/thomas/project/.claude/worktrees/cc-s-abc"),
            "-Users-thomas-project--claude-worktrees-cc-s-abc"
        );
    }

    #[test]
    fn extract_usage_valid() {
        let line = r#"{"message":{"usage":{"input_tokens":100,"output_tokens":50,"cache_creation_input_tokens":200,"cache_read_input_tokens":300}}}"#;
        let u = extract_usage(line).unwrap();
        assert_eq!(u.input, 100);
        assert_eq!(u.output, 50);
        assert_eq!(u.cache_creation, 200);
        assert_eq!(u.cache_read, 300);
    }

    #[test]
    fn extract_usage_partial() {
        let line = r#"{"message":{"usage":{"input_tokens":42,"output_tokens":10}}}"#;
        let u = extract_usage(line).unwrap();
        assert_eq!(u.input, 42);
        assert_eq!(u.output, 10);
        assert_eq!(u.cache_creation, 0);
        assert_eq!(u.cache_read, 0);
    }

    #[test]
    fn extract_usage_missing() {
        assert!(extract_usage(r#"{"type":"user"}"#).is_none());
    }

    #[test]
    fn extract_json_string_basic() {
        let line = r#"{"model":"claude-opus-4-6","type":"message"}"#;
        assert_eq!(
            extract_json_string(line, "model"),
            Some("claude-opus-4-6".into())
        );
    }

    #[test]
    fn extract_json_string_missing() {
        assert_eq!(extract_json_string(r#"{"type":"user"}"#, "model"), None);
    }

    #[test]
    fn find_matching_brace_simple() {
        assert_eq!(find_matching_brace("{}"), Some(1));
    }

    #[test]
    fn find_matching_brace_nested() {
        assert_eq!(find_matching_brace("{\"a\":{\"b\":1}}"), Some(12));
    }

    #[test]
    fn find_matching_brace_unbalanced() {
        assert_eq!(find_matching_brace("{"), None);
    }

    #[test]
    fn calculate_cost_sonnet() {
        let info = CostInfo {
            input_tokens: 1000,
            output_tokens: 500,
            cache_creation_tokens: 0,
            cache_read_tokens: 0,
            total_cost: None,
        };
        let cost = calculate_cost(&info, &SONNET_PRICING);
        // 1000 * 3/1M + 500 * 15/1M = 0.003 + 0.0075 = 0.0105
        assert!((cost - 0.0105).abs() < 0.0001);
    }

    #[test]
    fn pricing_selection_opus() {
        let p = pricing_for_model("claude-opus-4-6");
        assert_eq!(p.input_per_token, OPUS_PRICING.input_per_token);
    }

    #[test]
    fn pricing_selection_sonnet() {
        let p = pricing_for_model("claude-sonnet-4-6");
        assert_eq!(p.input_per_token, SONNET_PRICING.input_per_token);
    }

    #[test]
    fn pricing_selection_haiku() {
        let p = pricing_for_model("claude-haiku-4-5-20251001");
        assert_eq!(p.input_per_token, HAIKU_PRICING.input_per_token);
    }

    #[test]
    fn pricing_selection_default_sonnet() {
        let p = pricing_for_model("unknown-model");
        assert_eq!(p.input_per_token, SONNET_PRICING.input_per_token);
    }
}
