# Claude Deck Core

[![crates.io](https://img.shields.io/crates/v/claude-deck-core)](https://crates.io/crates/claude-deck-core) [![docs.rs](https://docs.rs/claude-deck-core/badge.svg)](https://docs.rs/claude-deck-core) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENSE)

Shared library powering both the [CLI](../cli) and the [desktop app](../../app).

## What's inside

| Module | Description |
|--------|-------------|
| `tmux` | Session lifecycle (create, attach, kill, rename, list), pane capture, command execution |
| `claude` | Claude Code detection, hooks management, launcher |
| `model` | Session model, status detection, persistence |
| `config` | Config file parsing (workspaces, tags, quick actions, settings) |
| `cost` | Session cost tracking |
| `ansi` | ANSI escape code stripping for pane output |
| `duration` | Human-readable duration formatting |

## Usage

```toml
[dependencies]
claude-deck-core = "0.1"
```

```rust
use claude_deck_core::tmux;
use claude_deck_core::model::session;

let sessions = session::list_sessions();
```

## License

[MIT](../../LICENSE)
