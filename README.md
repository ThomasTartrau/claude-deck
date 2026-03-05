# Claude Deck

A terminal dashboard for managing multiple [Claude Code](https://docs.anthropic.com/en/docs/claude-code) sessions via tmux.

Monitor status, launch sessions, switch workspaces, tag and filter — all from a single TUI.

<!-- ![demo](./assets/demo.gif) -->

## Features

- **Session management** — Launch, attach, kill, rename, and resume Claude Code sessions
- **Real-time status** — Detects Running / Waiting / Idle / Dead states from pane content
- **Workspaces** — Group sessions by project directory, switch between workspaces, session count badges
- **Tags** — Searchable multi-select picker, filter sessions by tags
- **Git integration** — Branch, dirty count, insertions/deletions, ahead/behind per session
- **Live preview** — Scrollable pane capture of the selected session
- **Session persistence** — Sessions are saved and automatically restored after reboot
- **Configurable** — Sort order, refresh interval, panel ratio, logs panel

## Install

```bash
cargo install --path .
```

Requires:
- [tmux](https://github.com/tmux/tmux) (sessions run inside tmux)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI installed

## Usage

```bash
claude-deck
```

## Keybindings

| Key | Action |
|-----|--------|
| `j` / `k` | Navigate sessions |
| `Enter` | Attach to session |
| `n` | New session (empty = auto-name) |
| `d` | Kill session |
| `R` | Rename session |
| `c` | Resume dead session |
| `p` | Send prompt to session |
| `t` | Tag picker (Space: toggle, Enter: save) |
| `w` | Workspace picker (a: add, d: delete) |
| `s` | Cycle sort (Name / Age / Status) |
| `y` | Copy preview to clipboard |
| `/` | Filter sessions by name |
| `h` / `l` | Resize panels |
| `g` | Toggle logs panel |
| `r` | Manual refresh |
| `q` | Quit |

## Configuration

Config file: `~/.config/claude-deck/config.toml`

```toml
refresh_interval_secs = 2
panel_ratio = 45
default_sort = "age"       # "name", "age", "status"
show_logs = false

[[workspaces]]
name = "api"
path = "/home/user/projects/api"

[tags]
"cc-my-session" = ["backend", "urgent"]
```

## How it works

Claude Deck uses tmux to run Claude Code instances in detached sessions. It detects session status by analyzing the pane content for Claude's UI markers (spinners = running, record symbol = waiting). Git info is fetched per unique working directory with caching. Active sessions are persisted to disk and restored on startup via `claude --resume`.

## License

[MIT](./LICENSE)
