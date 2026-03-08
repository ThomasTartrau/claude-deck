---
name: release
description: |
  Release process for claude-deck: how to release the app (manual git tags),
  core library, and CLI (automated via release-plz). Use this skill whenever
  someone asks about releasing, publishing, tagging, versioning, or deploying
  any part of claude-deck. Also trigger for questions about why the app isn't
  on crates.io, how release-plz works in this project, or how to bump versions.
---

# claude-deck Release Process

claude-deck has three publishable crates with two distinct release strategies:

| Crate | Release method | Publishes to crates.io | Git tag format |
|---|---|---|---|
| `claude-deck-core` | Automated (release-plz) | Yes | `core-v<version>` |
| `claude-deck-cli` | Automated (release-plz) | Yes | `cli-v<version>` |
| `claude-deck-app` | **Manual** (git tag) | No | `app-v<version>` |

## Core & CLI — Automated releases

release-plz handles everything for core and CLI:

1. On each push to `main`, the `release-plz.yml` workflow runs
2. release-plz detects version-worthy changes and opens a PR titled `chore: release`
3. The PR bumps versions in `Cargo.toml`, updates changelogs
4. Merging the PR triggers release-plz again, which:
   - Publishes to crates.io
   - Creates git tags (`core-v0.1.5`, `cli-v0.1.5`)
   - Creates a GitHub Release for the CLI

No manual intervention needed. Just merge PRs to `main` and release-plz handles the rest.

Config: `release-plz.toml` at the workspace root.

## App — Manual releases

The app is excluded from release-plz (`release = false` in `release-plz.toml`).

### Why the app can't use release-plz

Tauri's `build.rs` generates platform-specific files in `gen/schemas/` inside the source tree (outside `OUT_DIR`). release-plz runs `cargo package --verify` which fails when `build.rs` modifies the source directory. Since release-plz creates a worktree from the last release tag, the generated schema files differ between platforms (e.g., linux vs macOS), making this fundamentally incompatible.

### How to release a new app version

1. **Update the version** in `app/src-tauri/Cargo.toml`

2. **Create and push a git tag**:
   ```bash
   git tag app-v0.1.5
   git push origin app-v0.1.5
   ```

3. **Create a GitHub Release** from the tag:
   ```bash
   gh release create app-v0.1.5 --title "App v0.1.5" --notes "Release notes here"
   ```

4. The `release-app.yml` workflow automatically:
   - Injects the version from the tag into `tauri.conf.json`
   - Builds for macOS (aarch64 + x86_64) and Linux (Ubuntu 22.04)
   - Uploads platform binaries to the GitHub Release
   - Updates the Homebrew tap (`ThomasTartrau/homebrew-claude-deck`)

### Version sync

The app depends on `claude-deck-core` via path + version:
```toml
claude-deck-core = { path = "../../crates/core", version = "0.1.4" }
```

When bumping the app version, ensure `claude-deck-core` is already published at a compatible version on crates.io (release-plz handles this automatically for core).

## Key files

- `release-plz.toml` — Release-plz configuration
- `.github/workflows/release-plz.yml` — Automated release workflow (core + CLI)
- `.github/workflows/release-app.yml` — App build/release workflow (triggered by `app-v*` tags)
- `app/src-tauri/Cargo.toml` — App version (manual)
- `crates/core/Cargo.toml` — Core version (managed by release-plz)
- `crates/cli/Cargo.toml` — CLI version (managed by release-plz)
