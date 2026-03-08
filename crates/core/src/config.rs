use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedSession {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    pub refresh_interval_secs: u64,
    pub panel_ratio: u16,
    pub default_sort: String,
    pub show_logs: bool,
    pub workspaces: Vec<Workspace>,
    #[serde(default = "default_true")]
    pub notifications: bool,
    #[serde(default)]
    pub quick_actions: Vec<QuickAction>,
    #[serde(default)]
    pub tags: HashMap<String, Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuickAction {
    pub key: String,
    pub label: String,
    pub prompt: String,
}

fn default_true() -> bool {
    true
}

impl Default for Config {
    fn default() -> Self {
        Self {
            refresh_interval_secs: 2,
            panel_ratio: 45,
            default_sort: "age".into(),
            show_logs: false,
            notifications: true,
            workspaces: Vec::new(),
            quick_actions: Vec::new(),
            tags: HashMap::new(),
        }
    }
}

impl Config {
    pub fn load() -> Self {
        let path = config_path();
        match fs::read_to_string(&path) {
            Ok(content) => toml::from_str(&content).unwrap_or_default(),
            Err(_) => Self::default(),
        }
    }

    pub fn save(&self) {
        let path = config_path();
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(content) = toml::to_string_pretty(self) {
            let _ = fs::write(&path, content);
        }
    }

    pub fn tags_for(&self, session_name: &str) -> Vec<String> {
        self.tags.get(session_name).cloned().unwrap_or_default()
    }

    pub fn set_tags(&mut self, session_name: &str, tags: Vec<String>) {
        if tags.is_empty() {
            self.tags.remove(session_name);
        } else {
            self.tags.insert(session_name.to_string(), tags);
        }
    }

    pub fn all_tags(&self) -> Vec<String> {
        let mut tags: Vec<String> = self
            .tags
            .values()
            .flatten()
            .cloned()
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect();
        tags.sort();
        tags
    }

    pub fn add_workspace(&mut self, name: String, path: String) {
        if !self.workspaces.iter().any(|w| w.path == path) {
            self.workspaces.push(Workspace { name, path });
        }
    }

    pub fn remove_workspace(&mut self, idx: usize) {
        if idx < self.workspaces.len() {
            self.workspaces.remove(idx);
        }
    }

    /// Remove a workspace by its path string. Returns `true` if a workspace was removed.
    /// This is useful for Tauri where we identify workspaces by path rather than index.
    pub fn remove_workspace_by_path(&mut self, path: &str) -> bool {
        let before = self.workspaces.len();
        self.workspaces.retain(|w| w.path != path);
        self.workspaces.len() < before
    }
}

pub fn save_sessions(sessions: &[SavedSession]) {
    let path = config_dir().join("sessions.toml");
    #[derive(Serialize)]
    struct Wrapper<'a> {
        sessions: &'a [SavedSession],
    }
    if let Ok(content) = toml::to_string_pretty(&Wrapper { sessions }) {
        let _ = fs::write(&path, content);
    }
}

pub fn load_saved_sessions() -> Vec<SavedSession> {
    let path = config_dir().join("sessions.toml");
    match fs::read_to_string(&path) {
        Ok(content) => {
            #[derive(Deserialize)]
            struct Wrapper {
                #[serde(default)]
                sessions: Vec<SavedSession>,
            }
            toml::from_str::<Wrapper>(&content)
                .map(|w| w.sessions)
                .unwrap_or_default()
        }
        Err(_) => Vec::new(),
    }
}

pub fn config_dir() -> PathBuf {
    let dir = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("claude-deck");
    let _ = fs::create_dir_all(&dir);
    dir
}

pub fn config_path() -> PathBuf {
    config_dir().join("config.toml")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_default_values() {
        let config = Config::default();
        assert_eq!(config.refresh_interval_secs, 2);
        assert_eq!(config.panel_ratio, 45);
        assert_eq!(config.default_sort, "age");
        assert!(!config.show_logs);
        assert!(config.notifications);
        assert!(config.workspaces.is_empty());
        assert!(config.tags.is_empty());
    }

    #[test]
    fn config_roundtrip_toml() {
        let mut config = Config {
            refresh_interval_secs: 5,
            panel_ratio: 60,
            default_sort: "name".into(),
            show_logs: true,
            ..Default::default()
        };
        config.workspaces.push(Workspace {
            name: "myproject".into(),
            path: "/home/user/myproject".into(),
        });
        config
            .tags
            .insert("cc-test".into(), vec!["frontend".into(), "urgent".into()]);

        let toml_str = toml::to_string_pretty(&config).unwrap();
        let parsed: Config = toml::from_str(&toml_str).unwrap();

        assert_eq!(parsed.refresh_interval_secs, 5);
        assert_eq!(parsed.panel_ratio, 60);
        assert_eq!(parsed.default_sort, "name");
        assert!(parsed.show_logs);
        assert_eq!(parsed.workspaces.len(), 1);
        assert_eq!(parsed.workspaces[0].name, "myproject");
        assert_eq!(parsed.tags.get("cc-test").unwrap().len(), 2);
    }

    #[test]
    fn config_deserialize_missing_fields_uses_defaults() {
        let toml_str = r#"refresh_interval_secs = 10"#;
        let config: Config = toml::from_str(toml_str).unwrap();
        assert_eq!(config.refresh_interval_secs, 10);
        assert_eq!(config.panel_ratio, 45); // default
        assert_eq!(config.default_sort, "age"); // default
        assert!(config.notifications); // default true
    }

    #[test]
    fn config_notifications_disabled() {
        let toml_str = r#"notifications = false"#;
        let config: Config = toml::from_str(toml_str).unwrap();
        assert!(!config.notifications);
    }

    #[test]
    fn tags_for_returns_empty_when_missing() {
        let config = Config::default();
        assert!(config.tags_for("nonexistent").is_empty());
    }

    #[test]
    fn set_tags_and_retrieve() {
        let mut config = Config::default();
        config.set_tags("cc-app", vec!["web".into(), "prod".into()]);
        assert_eq!(config.tags_for("cc-app"), vec!["web", "prod"]);
    }

    #[test]
    fn set_tags_empty_removes_entry() {
        let mut config = Config::default();
        config.set_tags("cc-app", vec!["web".into()]);
        config.set_tags("cc-app", vec![]);
        assert!(config.tags_for("cc-app").is_empty());
        assert!(!config.tags.contains_key("cc-app"));
    }

    #[test]
    fn all_tags_deduplicates_and_sorts() {
        let mut config = Config::default();
        config.set_tags("s1", vec!["beta".into(), "alpha".into()]);
        config.set_tags("s2", vec!["alpha".into(), "gamma".into()]);
        let all = config.all_tags();
        assert_eq!(all, vec!["alpha", "beta", "gamma"]);
    }

    #[test]
    fn add_workspace_no_duplicates() {
        let mut config = Config::default();
        config.add_workspace("proj".into(), "/home/proj".into());
        config.add_workspace("proj2".into(), "/home/proj".into());
        assert_eq!(config.workspaces.len(), 1);
    }

    #[test]
    fn remove_workspace_by_index() {
        let mut config = Config::default();
        config.add_workspace("a".into(), "/a".into());
        config.add_workspace("b".into(), "/b".into());
        config.remove_workspace(0);
        assert_eq!(config.workspaces.len(), 1);
        assert_eq!(config.workspaces[0].name, "b");
    }

    #[test]
    fn remove_workspace_out_of_bounds_noop() {
        let mut config = Config::default();
        config.add_workspace("a".into(), "/a".into());
        config.remove_workspace(5);
        assert_eq!(config.workspaces.len(), 1);
    }

    #[test]
    fn remove_workspace_by_path_found() {
        let mut config = Config::default();
        config.add_workspace("a".into(), "/a".into());
        config.add_workspace("b".into(), "/b".into());
        assert!(config.remove_workspace_by_path("/a"));
        assert_eq!(config.workspaces.len(), 1);
        assert_eq!(config.workspaces[0].name, "b");
    }

    #[test]
    fn remove_workspace_by_path_not_found() {
        let mut config = Config::default();
        config.add_workspace("a".into(), "/a".into());
        assert!(!config.remove_workspace_by_path("/nonexistent"));
        assert_eq!(config.workspaces.len(), 1);
    }

    #[test]
    fn saved_session_roundtrip_toml() {
        let sessions = vec![
            SavedSession {
                name: "cc-app".into(),
                path: "/home/user/app".into(),
            },
            SavedSession {
                name: "cc-api".into(),
                path: "/home/user/api".into(),
            },
        ];

        #[derive(Serialize)]
        struct Wrapper<'a> {
            sessions: &'a [SavedSession],
        }

        let toml_str = toml::to_string_pretty(&Wrapper {
            sessions: &sessions,
        })
        .unwrap();

        #[derive(Deserialize)]
        struct WrapperOwned {
            sessions: Vec<SavedSession>,
        }

        let parsed: WrapperOwned = toml::from_str(&toml_str).unwrap();
        assert_eq!(parsed.sessions.len(), 2);
        assert_eq!(parsed.sessions[0].name, "cc-app");
        assert_eq!(parsed.sessions[1].path, "/home/user/api");
    }
}
