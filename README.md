# Claude Deck

[![CI](https://github.com/ThomasTartrau/claude-deck/actions/workflows/ci.yml/badge.svg)](https://github.com/ThomasTartrau/claude-deck/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Manage multiple [Claude Code](https://docs.anthropic.com/en/docs/claude-code) sessions from a single interface.

## Packages

| Package | Description | |
|---------|-------------|---|
| [`claude-deck-cli`](./crates/cli) | Terminal dashboard (TUI) via tmux | [![crates.io](https://img.shields.io/crates/v/claude-deck-cli)](https://crates.io/crates/claude-deck-cli) |
| [`claude-deck-app`](./app) | Desktop app (Tauri) with embedded terminal | [Releases](https://github.com/ThomasTartrau/claude-deck/releases) |
| [`claude-deck-core`](./crates/core) | Shared library (sessions, tmux, config) | [![crates.io](https://img.shields.io/crates/v/claude-deck-core)](https://crates.io/crates/claude-deck-core) |

## Quick start

**CLI** (requires tmux):

```bash
brew install ThomasTartrau/claude-deck/claude-deck
# or
cargo install claude-deck-cli
```

**App** (macOS):

```bash
brew install --cask ThomasTartrau/claude-deck/claude-deck
```

Or download from [Releases](https://github.com/ThomasTartrau/claude-deck/releases).

## License

[MIT](./LICENSE)
