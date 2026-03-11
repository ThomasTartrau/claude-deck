---
name: ship
description: |
  Run CI checks locally then commit, push, and create a GitHub PR. Use this skill whenever
  the user asks to ship, push their work, create a PR, or run checks before pushing.
  Also trigger for: "vérifie et push", "ship it", "fais la PR",
  "commit push pr", "run checks and push", "prépare la PR". Works in French and English.
---

# Ship - Local CI + Commit + Push + PR

This skill runs the same checks as CI locally, then commits, pushes, and creates a PR.

**STRICT RULE: ALL checks MUST pass before proceeding. No exceptions.**

## Step 1: Discover and run ALL checks

### 1a. Find check commands from ALL sources

Collect check commands from every source that exists:

1. **CI workflow** (`.github/workflows/ci.yml` or similar): read it and extract every `run:`
   command from check jobs (fmt, clippy, test, lint, typecheck, build, etc.). Ignore setup
   steps (actions/checkout, apt-get install, actions/setup-node, pnpm install, etc.).
   For jobs with `working-directory`, run from that directory.

2. **package.json** (root and subdirectories like `app/`): read `scripts` and run at minimum:
   - `lint` (if it exists)
   - `build` or `typecheck` or `tsc` (if they exist)
   Any script that performs a check must be run.

3. **Rust workspace**: always run:
   - `cargo fmt --all -- --check`
   - `cargo clippy --workspace --all-targets -- -D warnings`
   - `cargo test --workspace`

### 1b. Run all checks

Run every discovered check command. **Every single one must pass.**

If a check fails:
1. Fix the issue
2. Re-run the **failing check** to confirm it passes
3. Re-run **ALL checks** one final time to confirm nothing is broken

**Do NOT proceed to Step 2 until every check is green.**

## Step 2: Validate branch name

The branch must follow conventional commit naming: `<type>/<short-description>`

Valid types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`, `style`, `build`

The description part should be kebab-case, 2-4 words summarizing the changes.

**Examples:**
- `feat/add-user-export`
- `fix/login-redirect-loop`
- `chore/update-dependencies`

If the current branch doesn't match this format, rename it:
```bash
git branch -m <type>/<short-description>
```

If already pushed under the old name, delete the old remote branch first.

Do not rename `main` or `master`.

## Step 3: Commit

```bash
git status
git diff
git log --oneline -5
```

Stage relevant files (never `git add -A` blindly — check what you're staging).

Write a conventional commit message based on the changes:
```
<type>: <short description>
```

If an issue number is known from conversation context, include it: `feat: #42 add export`.

## Step 4: Push

```bash
git push -u origin <branch-name>
```

## Step 5: Create PR

Use `gh pr create` with:
- A short title (under 70 chars)
- A body with a summary and test plan

```bash
gh pr create --title "<title>" --body "$(cat <<'EOF'
## Summary
<1-3 bullet points>

## Test plan
- [ ] <what to test>
EOF
)"
```

Return the PR URL when done.
