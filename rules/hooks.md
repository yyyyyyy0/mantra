# Hooks System

Hooks are treated not as "convenience features" but as a policy-as-code layer that keeps a thin harness active at all times.

See [docs/harness-engineering.md](../docs/ja/harness-engineering.md) for the detailed contract.

## Hook Types

- `PreToolUse`: Guards against dangerous operations before execution and enforces isolated workspaces
- `PostToolUse`: Lightweight verification and artifact guidance immediately after edits
- `Stop`: Detects missing verification or handover steps

## Required Behavior

### PreToolUse

- Block or confirm high-risk operations such as `git reset --hard`, `rm -rf`, `sudo`, and deploy-related commands
- Avoid direct edits on a dirty tree; prompt for `maw` / worktree instead
- Return to plan-first for 3+ step, high-risk, or public contract changes

### PostToolUse

- Run the repo's canonical verify command, or a lightweight subset of it
- Prioritize lint / typecheck per changed file to keep per-run cost low
- For changes requiring visual / acceptance review, indicate the runbook or artifact location

### Stop

- Warn when changes exist but no verification record is present
- Warn if working in a `maw` workspace without completing `maw handover`
- Do not leave a continuation state that lacks `next step` and `evidence refs`

## Repo Hook Pairing

To ensure a minimum quality gate even in environments without editor/tool hooks, place a `pre-push` hook on the repo side.

- Call the canonical verify command (1 repo, 1 command)
- Leave visual / acceptance checks in the manual runbook
- Template is at [templates/repo-pre-push.example.sh](../templates/repo-pre-push.example.sh)

## Auto-Accept Permissions

Use with caution:
- Enable only for trusted, well-defined plans
- Disable for exploratory work
- Never use `dangerously-skip-permissions`

## Todo / Plan Tracking

Use Todo-style tracking to keep multi-step work visible, especially when a task crosses plan / execute boundaries.

## Named Failure Modes

- **FM-GIT-NOVERIFY**: `dangerously-skip-permissions` や `--no-verify` でフックをバイパスしない。
- **FM-SKIP-CHECK**: フックが存在するなら理由がある。失敗を修正し、迂回しない。
