use clap::{Parser, Subcommand};

#[derive(Debug, Parser)]
#[command(
    name = "claude-deck",
    version,
    about = "TUI dashboard for managing Claude Code sessions via tmux"
)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Option<Command>,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// List all Claude sessions (outputs JSON)
    List,
    /// Launch a new Claude session
    Launch {
        /// Session name
        name: String,
        /// Initial prompt to send
        #[arg(short, long)]
        prompt: Option<String>,
        /// Working directory (defaults to current git root)
        #[arg(long)]
        path: Option<String>,
    },
    /// Kill a session
    Kill {
        /// Session name
        name: String,
    },
    /// Resume a dead session
    Resume {
        /// Session name
        name: String,
        /// Working directory
        #[arg(long)]
        path: Option<String>,
    },
    /// Attach to a session (interactive tmux)
    Attach {
        /// Session name
        name: String,
    },
    /// Rename a session
    Rename {
        /// Current session name
        old: String,
        /// New session name
        new: String,
    },
    /// Send text/prompt to a running session
    Send {
        /// Session name
        name: String,
        /// Text to send
        text: String,
    },
    /// Set tags on a session
    Tag {
        /// Session name
        name: String,
        /// Comma-separated tags (empty string to clear)
        tags: String,
    },
    /// List all known tags (outputs JSON)
    Tags,
    /// Show session statistics (outputs JSON)
    Stats,
}

#[cfg(test)]
mod tests {
    use super::*;
    use clap::error::ErrorKind;

    fn parse(args: &[&str]) -> Result<Cli, clap::Error> {
        Cli::try_parse_from(args)
    }

    #[test]
    fn no_subcommand_returns_none() {
        let cli = parse(&["claude-deck"]).unwrap();
        assert!(cli.command.is_none());
    }

    #[test]
    fn list_subcommand() {
        let cli = parse(&["claude-deck", "list"]).unwrap();
        assert!(matches!(cli.command, Some(Command::List)));
    }

    #[test]
    fn launch_name_only() {
        let cli = parse(&["claude-deck", "launch", "myapp"]).unwrap();
        match cli.command {
            Some(Command::Launch { name, prompt, path }) => {
                assert_eq!(name, "myapp");
                assert!(prompt.is_none());
                assert!(path.is_none());
            }
            _ => panic!("expected Launch"),
        }
    }

    #[test]
    fn launch_with_prompt_and_path() {
        let cli = parse(&[
            "claude-deck",
            "launch",
            "api",
            "-p",
            "fix the bug",
            "--path",
            "/tmp/repo",
        ])
        .unwrap();
        match cli.command {
            Some(Command::Launch { name, prompt, path }) => {
                assert_eq!(name, "api");
                assert_eq!(prompt.as_deref(), Some("fix the bug"));
                assert_eq!(path.as_deref(), Some("/tmp/repo"));
            }
            _ => panic!("expected Launch"),
        }
    }

    #[test]
    fn launch_missing_name_fails() {
        let err = parse(&["claude-deck", "launch"]).unwrap_err();
        assert_eq!(err.kind(), ErrorKind::MissingRequiredArgument);
    }

    #[test]
    fn kill_subcommand() {
        let cli = parse(&["claude-deck", "kill", "cc-api"]).unwrap();
        match cli.command {
            Some(Command::Kill { name }) => assert_eq!(name, "cc-api"),
            _ => panic!("expected Kill"),
        }
    }

    #[test]
    fn resume_with_path() {
        let cli = parse(&["claude-deck", "resume", "cc-api", "--path", "/tmp"]).unwrap();
        match cli.command {
            Some(Command::Resume { name, path }) => {
                assert_eq!(name, "cc-api");
                assert_eq!(path.as_deref(), Some("/tmp"));
            }
            _ => panic!("expected Resume"),
        }
    }

    #[test]
    fn attach_subcommand() {
        let cli = parse(&["claude-deck", "attach", "cc-web"]).unwrap();
        match cli.command {
            Some(Command::Attach { name }) => assert_eq!(name, "cc-web"),
            _ => panic!("expected Attach"),
        }
    }

    #[test]
    fn rename_subcommand() {
        let cli = parse(&["claude-deck", "rename", "old-name", "new-name"]).unwrap();
        match cli.command {
            Some(Command::Rename { old, new }) => {
                assert_eq!(old, "old-name");
                assert_eq!(new, "new-name");
            }
            _ => panic!("expected Rename"),
        }
    }

    #[test]
    fn rename_missing_new_fails() {
        let err = parse(&["claude-deck", "rename", "old-name"]).unwrap_err();
        assert_eq!(err.kind(), ErrorKind::MissingRequiredArgument);
    }

    #[test]
    fn send_subcommand() {
        let cli = parse(&["claude-deck", "send", "cc-api", "run the tests"]).unwrap();
        match cli.command {
            Some(Command::Send { name, text }) => {
                assert_eq!(name, "cc-api");
                assert_eq!(text, "run the tests");
            }
            _ => panic!("expected Send"),
        }
    }

    #[test]
    fn tag_subcommand() {
        let cli = parse(&["claude-deck", "tag", "cc-api", "backend,urgent"]).unwrap();
        match cli.command {
            Some(Command::Tag { name, tags }) => {
                assert_eq!(name, "cc-api");
                assert_eq!(tags, "backend,urgent");
            }
            _ => panic!("expected Tag"),
        }
    }

    #[test]
    fn tag_empty_string_clears() {
        let cli = parse(&["claude-deck", "tag", "cc-api", ""]).unwrap();
        match cli.command {
            Some(Command::Tag { name, tags }) => {
                assert_eq!(name, "cc-api");
                assert_eq!(tags, "");
            }
            _ => panic!("expected Tag"),
        }
    }

    #[test]
    fn tags_subcommand() {
        let cli = parse(&["claude-deck", "tags"]).unwrap();
        assert!(matches!(cli.command, Some(Command::Tags)));
    }

    #[test]
    fn stats_subcommand() {
        let cli = parse(&["claude-deck", "stats"]).unwrap();
        assert!(matches!(cli.command, Some(Command::Stats)));
    }

    #[test]
    fn unknown_subcommand_fails() {
        let err = parse(&["claude-deck", "foobar"]).unwrap_err();
        assert_eq!(err.kind(), ErrorKind::InvalidSubcommand);
    }
}
