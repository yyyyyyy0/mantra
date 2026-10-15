# mantra

日本語版: [README.ja.md](./README.ja.md)

My personal Claude Code harness: four short rule files, four agents and one guard hook, linked into `~/.claude` from a dedicated clone. It needs only bash and jq.

## What it is

Claude Code loads `~/.claude/rules` and `~/.claude/agents` in every session. mantra is the version-controlled source for both, plus the scripts that keep them safe to change.

- **Rules** say how I want work done: use subagents and reviews without being asked, pick the cheapest model that does the job, avoid a few known shortcuts, follow my git habits.
- **Agents**: `planner` (opus) and the reviewers `code-reviewer`, `security-reviewer` and `mob-critic` (sonnet).
- **Guard hook**: a PreToolUse hook that denies destructive commands and attempts to bypass git hooks.
- **Templates** for adding a small harness to other repos.

## Why it is small

mantra used to be much bigger: fifteen agents, a TypeScript sync tool, and about 40 KB of rules loaded in every session. Usage data showed that most of it was never used or had no visible effect. Current guidance also favours short always-on instructions that get pruned whenever a new model ships. So the rules are capped at 200 lines and 8 KB, and the rest was retired. The evidence and reasoning are in [docs/MODERNIZATION_PLAN.md](./docs/MODERNIZATION_PLAN.md). Everything from before is recoverable from the git tag `pre-redesign`.

## Layout

| Path | Contents |
|---|---|
| `rules/` | `delegation.md`, `performance.md`, `failure-modes.md`, `git-workflow.md` (always loaded, 200 lines / 8 KB in total) |
| `agents/` | `planner`, `code-reviewer`, `security-reviewer`, `mob-critic` |
| `hooks/guard.sh` | PreToolUse guard for destructive commands and hook bypasses |
| `scripts/` | `install.sh`, `deploy.sh`, `verify.sh` |
| `githooks/pre-push` | Runs `scripts/verify.sh` before a push |
| `tests/` | Shell tests for the guard, `install.sh` and `deploy.sh` |
| `templates/` | Pointer-style `AGENTS.md` and a pre-push hook for other repos |
| `docs/` | The redesign plan, the rules mapping, and the [harness guide for other repos](./docs/ja/harness-engineering.md) (Japanese) |

## Install

There are two checkouts. The dev checkout (for example `~/src/mantra`) is where you work, in branches and worktrees as you like. The live clone `~/.mantra/live` is detached at `origin/main`, and `~/.claude` points only at it. Work in progress therefore never changes the live config.

First install, from the dev checkout:

```sh
scripts/deploy.sh --init
```

This clones the live clone and then deploys it. `scripts/install.sh` does the linking:

- `~/.claude/rules` becomes a symlink to `<live>/rules`.
- `~/.claude/agents/` becomes a real directory with one symlink per mantra agent. Other agents already in it are kept.
- It supports `--dry-run`, is idempotent, and never edits `settings.json`.
- It refuses to run from anything but the live clone (for the real `HOME`, only from `~/.mantra/live`).

Register the guard once by hand in `~/.claude/settings.json`, merging into any existing hooks:

```json
"PreToolUse": [{"matcher": "Bash", "hooks": [{"type": "command", "command": "bash ~/.mantra/live/hooks/guard.sh"}]}]
```

The guard is fail-open: if `jq` is missing it does nothing. It is a seatbelt against accidents, not a sandbox.

In the dev checkout, turn on the pre-push gate once:

```sh
git config core.hooksPath githooks
```

## Updating

1. Make the change in a branch or worktree of the dev checkout and open a PR.
2. CI (`validate`) runs `scripts/verify.sh`.
3. A human merges.
4. Run `scripts/deploy.sh` from the dev checkout.

`scripts/deploy.sh [--init] [--dry-run] [--force]` does the following:

- fetches origin in the live clone, and refuses a non-fast-forward unless you pass `--force`;
- shows `git log --stat` of what will change;
- verifies origin/main in a temporary export (`bash -n hooks/guard.sh`, then `scripts/verify.sh`) before switching;
- checks out origin/main detached and runs `install.sh`; if that fails, it returns to the previous commit.

## Verify

```sh
npm run verify    # same as: bash scripts/verify.sh
```

It has no dependencies. It needs bash and jq; shellcheck is optional locally and required in CI. It checks:

- the always-on rules budget (200 lines, 8 KB);
- a few sentinel strings that must survive in `rules/`;
- no relative `../` links in `rules/` or `agents/`;
- agent frontmatter, and that agents do not set `hooks`, `mcpServers` or `permissionMode`;
- the shell test suites in `tests/`;
- shellcheck.

## Maintenance

- When a new Claude model ships, run `/doctor prompt-audit` and go through each rule line with one question: would removing this cause a mistake? If not, delete it.
- To bring back a retired behavior, find it in [docs/redesign/rules-mapping.md](./docs/redesign/rules-mapping.md) and restore one line from `git show pre-redesign:rules/<file>`.

## Other repos

[docs/ja/harness-engineering.md](./docs/ja/harness-engineering.md) (Japanese) explains how to give another repo a minimal harness. The templates are [templates/repo-agents-pointer.md](./templates/repo-agents-pointer.md), a thin `AGENTS.md` that points to the real docs, and [templates/repo-pre-push.example.sh](./templates/repo-pre-push.example.sh), a pre-push hook that calls one verify command.

## License

MIT. See [LICENSE](./LICENSE).
