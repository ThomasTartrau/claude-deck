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

The checks to run are **never hardcoded** here — they come from reading the CI config file
every time. This way, if CI evolves, this skill automatically stays in sync.

## Step 1: Read CI config and run checks

Find the CI workflow file (`.github/workflows/ci.yml` or similar) in the repo root.

Read it and extract every `run:` command from jobs that perform checks (fmt, clippy, test,
lint, typecheck, etc.). Ignore CI-only setup steps (actions/checkout, apt-get install,
actions/setup-node, pnpm install, etc.) — only extract the actual check commands.

For frontend jobs that set `working-directory`, run those commands from that directory.

Run all extracted check commands locally. If a check fails, fix the issue and re-run
until all checks pass. Do not proceed to step 2 until everything is green.

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
