# PR Automation

## Overview

Based on PR risk classification, low-risk PRs are auto-merged while medium-to-high risk PRs maintain a human gate.

## Risk Levels

| Level | Conditions | Action |
|-------|-----------|--------|
| `risk:low` | docs only / deps patch (Dependabot/Renovate) / generated files / tests only | Auto-merge after CI + AI review green |
| `risk:medium` | Anything other than the above, with no high-risk paths | AI review comment + human approve required |
| `risk:high` | auth, migrations, CI config, billing, infra, security paths | Human review required + security check |

## Workflows

- **`risk-classifier.yml`**: Analyzes the PR diff paths and assigns `risk:low/medium/high` labels
- **`ai-review.yml`**: Posts a `pending` status when a PR is created, indicating it is awaiting local review
- **`auto-merge.yml`**: `risk:low` + all checks green + no AI critical findings → `gh pr merge --auto --squash`

## Local AI Review

AI review is run using the local Claude Code CLI, not inside GitHub Actions.

### Automatic Execution (PostToolUse hook)

When `gh pr create` is run in Claude Code, the PostToolUse hook launches `scripts/pr-review.sh` in the background. The review result is posted to GitHub as a PR comment and a commit status.

### Manual Execution

```bash
npm run review:pr -- <PR number>
```

Use this when a PR was created outside Claude Code or when a re-review is needed.

### Processing Flow

```
gh pr create → PostToolUse hook fires → scripts/pr-review.sh (background)
  1. Fetch diff via gh pr diff (truncated at 100KB)
  2. Run AI review via claude -p --model sonnet
  3. Post review result as PR comment via gh pr comment
  4. Set commit status via gh api statuses/
     → success: no critical findings → auto-merge candidate
     → failure: critical findings present → auto-merge blocked
```

## Escape Hatches

- **`no-auto-merge` label**: Applying this manually suppresses auto-merge even for `risk:low` PRs
- **`auto-merged` label**: Applied to PRs that were auto-merged (for audit purposes)

## Configuration

High-risk path definitions can be customized per project in `.github/risk-paths.json`.

## Prerequisites

- `claude` CLI installed and OAuth authenticated (verify with `claude --version`)
- `gh` CLI authenticated (verify with `gh auth status`)
- `jq` installed (verify with `jq --version`; used for parsing PR metadata)

## Branch Protection Settings

Configure the following on the `main` branch:

```
Required status checks:
  - validate
  - typecheck / lint / test:coverage (inside the validate job)
  - classify (risk-classifier)
  - ai-review/critical-findings (commit status — posted by the local script)

Required reviews:
  - 1 approval (risk:medium and risk:high only — controlled via GitHub CODEOWNERS or rulesets)

Auto-merge: enabled
```

## Security Considerations

- **Expression injection prevention**: PR title, body, and diff are all passed via environment variables or files
- **Config tamper prevention**: `risk-paths.json` is checked out from the base branch (`main`)
- **AI review gate**: Determined by commit status (`ai-review/critical-findings`). PR comments are for reference only
- **Fail-closed**: On Claude CLI failure or abnormal response, a `failure` status is posted and auto-merge is blocked
- **Prompt injection mitigation**: Reviewer instructions are placed at the top of the prompt; the prompt explicitly states that instructions inside the diff should be ignored
- **Pending = blocked**: When review has not been run, the status remains `pending` and auto-merge is blocked
- **Action pinning**: GitHub Actions are pinned by commit SHA

## Rollout

1. Pilot in mantra first to verify behavior
2. Copy the template (`~/.claude/templates/pr-automation/`) to other projects
3. Customize `.github/risk-paths.json` for each project
4. In the future, consolidate as a reusable workflow (`workflow_call`) in a shared repository
