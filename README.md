# mantra

日本語版は [README.ja.md](./README.ja.md) をご覧ください。

A repo-ops harness for bounded, continuous improvement of existing repositories.

Built around `autonomous-improvement-loop`, mantra introduces a thin harness contract (thin AGENTS.md / canonical verify / hook / handoff) into existing repos, running a safe improvement cycle of 1 round = 1 issue.

Setup is as simple as running `npm run onboarding`.
Use `npm run onboarding:full` to include Codex sync, or `npm run onboarding:claude` for Claude Code sync.

---

## What mantra is

mantra supports continuous improvement of existing repos on three pillars:

| Pillar | Summary |
|---|---|
| **autonomous-improvement-loop (AIL)** | Incremental improvement at 1 round = 1 issue. Advances safely within a bounded change budget (max 3 files / 200 lines). |
| **Harness Engineering** | thin AGENTS.md / canonical verify / hook contract creates a consistent entry point for any repo. |
| **Session Continuity** | handoff summaries and ledgers keep work unbroken across sessions. |

mantra is not a general-purpose agent pack. It is an operational harness for making existing repos incrementally better, safely.

---

## Primary workflow: autonomous-improvement-loop

`autonomous-improvement-loop` is mantra's flagship workflow. Use it for incremental improvement of existing repos — not for greenfield design.

```text
issue queue → select 1 issue → bounded fix → verify → handoff
                                    ↑                    │
                                    └────── next round ───┘
```

- **1 round = 1 issue**: No fixed round cap. Each round selects one issue and fixes it in a bounded way.
- **Change budget**: max 3 changed files / 200 changed lines per round
- **Safe boundary**: When a new user steer arrives, stop at a safe boundary after the current atomic step.
- **QA-only mode**: With a dirty worktree or unstable baseline, collect evidence and make recommendations only — no edits.
- **Structured output**: Emit an `[AIL][rNN]` summary block every round; leave a final handoff summary on stop.

The source of truth is [`agents/autonomous-improvement-loop.family`](./agents/autonomous-improvement-loop.family/).

For a walkthrough of real-world usage, see [examples/ja/ail-repo-improvement-loop.md](./examples/ja/ail-repo-improvement-loop.md).

---

## Repo adoption path

The shortest path to introducing mantra's harness into an existing repo:

1. **Place a thin AGENTS.md** — start from the [template](./templates/repo-agents-pointer.md), fill in Purpose / Canonical verify / Session continuity.
2. **Define a canonical verify** — pick one verification command for the repo and document it in AGENTS.md (e.g. `npm run verify`).
3. **Set up the hook contract** — use the [repo pre-push template](./templates/repo-pre-push.example.sh) to call canonical verify on every push.
4. **Run continuity** — use `maw handover/takeover` and the [Obsidian ledger template](./templates/repo-obsidian-ledger.md) for session handoff.

For full details, see [docs/harness-engineering.md](./docs/ja/harness-engineering.md) (the canonical adoption path reference).

---

## Start here

1. `npm ci` — install dependencies
2. `npm run onboarding` — setup + validation (core)
3. `npm run onboarding:full` — setup + validation + Codex sync (optional)
4. `npm run smoke:onboarding` — smoke-test the onboarding path (optional)

---

## Quickstart

```bash
# 1. Clone
git clone https://github.com/yyyyyyy0/mantra ~/.mantra
cd ~/.mantra

# 2. Install dependencies
npm ci

# 3. Setup + validate (shortest path)
npm run onboarding

# 4. Also run Codex sync (optional)
npm run onboarding:full
```

To recreate existing symlinks/directories (real directories are backed up):

```bash
npm run setup -- --force
```

---

## Operating model

This repository operates across three layers:

| Layer | Definition | Execution path |
|---|---|---|
| **Core** | Minimum guarantee for configuration and validation. Creates `agents` / `rules` symlinks. | `npm run onboarding` (normal operation) |
| **Optional** | Additional experiences that augment Core. Codex / Claude Code sync and extended runs. | `npm run onboarding:full` / `npm run onboarding:claude` (opt-in) |
| **Experimental** | Coordinated judgment for multi-perspective or high-risk situations. Not always active. | `mob-*` agents (on demand only) |

### Core path

```text
Quick onboarding (default): setup + validate
`npm run onboarding`
```

### Optional path

```text
Add Codex sync: setup + validate + sync
`npm run onboarding:full`

Add Claude Code sync: setup + validate + claude sync
`npm run onboarding:claude`
```

### Experimental path

```text
High-risk work requiring multi-perspective judgment
Use `mob-navigator/mob-critic/mob-scribe` conditionally
```

### Specialist invocation (single-agent first)

Start with the `single-agent` path. Invoke a specialist only when a condition below is met.

| Condition | Recommended |
|---|---|
| 1 file / clear fix / small change | single-agent first |
| Incremental improvement, defect reduction, post-change hardening on an existing repo | Consider `autonomous-improvement-loop` |
| 3+ implementation steps, or 2+ files, or design tradeoffs | Consider `planner` |
| Unresolved High/Medium risks remain after pre-implementation review | `replan` to re-plan (conditional) |
| Code quality check needed after implementation | `code-reviewer` (when needed) |
| Ambiguous requirements, high failure cost, multiple stakeholders | Consider `mob` agents (`mob-navigator` → `mob-critic` → `mob-scribe`) |

**Choosing between `planner` and `replan`**
- `planner`: Creates the initial implementation plan.
- `replan`: Re-plans before implementation based on review results (only when `High + Medium > 0`).
- Do not launch both in the same round (hand off `planner` output to `replan`).

---

## Setup verification

Verify that setup completed correctly with these commands:

```bash
# Verify dependencies
npm ci
# Expected: completes without errors

# Verify agents/rules definitions
npm run validate
# Expected output example:
# - ✓ <N> agent definitions valid
# - ✓ <N> rule definitions valid
# - ✓ drift validation passed (<checked> families checked / <seen> families seen)

# TypeScript type check
npm run typecheck
# Expected: completes without errors

# Lint (warnings also treated as failures)
npm run lint
# Expected: completes without errors

# Verify symlinks
ls -la ~/.claude/agents  # → ~/.mantra/generated/agents (merged when user-defined or family config exists)
ls -la ~/.claude/rules   # → symlink to mantra/rules (direct core link when no family)
```

**Common troubleshooting:**
- `npm ci` fails: verify Node.js v20+ is installed
- `npm run validate` fails: check agents/rules `.md` / `*.family` structure, duplicate output names, `drift_guard` settings
- Symlinks not created: try `npm run setup -- --force` (existing directories are backed up)
- After `npm run setup` succeeds: Core next step is `npm run validate`, Optional next step is `npm run sync:codex`
- Per-`error_code` remediation: [docs/troubleshooting.md](./docs/ja/troubleshooting.md)

---

## Directory structure

```
mantra/
├── agents/          # Claude Code agent definitions (legacy .md / *.family)
├── rules/           # Claude Code rule definitions (.md)
├── scripts/
│   ├── lib/                  # Shared helpers (schema/path/meta/parser)
│   ├── setup.ts              # Symlink creation script
│   ├── sync-agents-to-codex.ts   # Sync agents to Codex
│   ├── sync-rules-to-codex.ts    # Sync rules to Codex
│   ├── sync-agents-to-claude.ts  # Sync agents to Claude Code
│   ├── sync-rules-to-claude.ts   # Sync rules to Claude Code
│   ├── validate-agents.ts    # Agent validation
│   ├── validate-rules.ts     # Rule validation
│   └── validate-drift.ts     # Family drift guard validation
└── package.json
```

---

## Agent list

mantra ships with specialist agents. The primary workflow is `autonomous-improvement-loop`; other agents support planning, review, and orchestration.

| Agent | Purpose |
|---|---|
| `autonomous-improvement-loop` | Continuous improvement of existing repositories. Advances 1 round = 1 issue, stops and hands off at safe boundaries. |
| `architect` | System design and architecture decisions |
| `build-error-resolver` | Fix build errors and type errors |
| `code-reviewer` | Code review (quality, security, maintainability) |
| `doc-updater` | Update documentation and code maps |
| `e2e-runner` | E2E testing (Playwright) |
| `mob-critic` | Mob programming: challenge assumptions, find risks |
| `mob-navigator` | Mob programming: orchestrate decision flow |
| `mob-scribe` | Mob programming: normalize and summarize outputs |
| `planner` | Plan feature implementation and refactoring |
| `replan` | Re-plan before implementation based on review results (conditional) |
| `refactor-cleaner` | Remove and clean up dead code |
| `security-reviewer` | Detect and fix security vulnerabilities |
| `tdd-guide` | Test-driven development (test-first) |

---

## Rule list

Rules under `rules/` are symlinked to `~/.claude/rules/` and applied automatically to all projects.

| Rule | Content |
|---|---|
| `agents.md` | Agent orchestration and parallel execution |
| `coding-style.md` | Immutability, file organization, error handling |
| `git-workflow.md` | Commit messages and PR workflow |
| `hooks.md` | Claude Code hooks configuration and usage |
| `mob-programming.md` | Mob programming: multi-agent collaboration and decision protocol |
| `patterns.md` | API response format, custom hooks, repository pattern |
| `performance.md` | Model selection, context management, Ultrathink |
| `security.md` | Security checklist and secret management |
| `testing.md` | Test coverage requirements and TDD workflow |

---

## Scripts

| Command | Description |
|---|---|
| `npm run setup` | Create symlinks (initial setup) |
| `npm run onboarding` | Run setup + validation in one step (core) |
| `npm run onboarding:full` | Run setup + validation + Codex sync in one step (optional) |
| `npm run onboarding:claude` | Run setup + validation + Claude Code sync in one step (optional) |
| `npm run onboarding:json` | Run onboarding in JSON output mode |
| `npm run onboarding:full:json` | Run onboarding:full in JSON output mode |
| `npm run metrics:report -- --days 7` | Aggregate recent metrics locally (`--json` supported) |
| `npm run setup -- --force` | Back up existing real directories/files to `.bak-YYYYMMDDHHmmss` and recreate |
| `npm run sync:codex` | Sync agents/rules/templates/examples to Codex |
| `npm run sync:codex:json` | Run sync in JSON output mode |
| `npm run sync:codex:agents` | Sync agents only to Codex |
| `npm run sync:codex:rules` | Sync rules only to Codex |
| `npm run sync:codex:templates` | Sync templates only to Codex |
| `npm run sync:codex:examples` | Sync examples only to Codex |
| `npm run sync:codex:preview` | Show effective content without writing |
| `npm run sync:codex:preview:json` | Run preview in JSON output mode |
| `npm run sync:claude` | Sync agents/rules to Claude Code |
| `npm run sync:claude:json` | Run sync in JSON output mode |
| `npm run sync:claude:agents` | Sync agents only to Claude Code |
| `npm run sync:claude:rules` | Sync rules only to Claude Code |
| `npm run sync:claude:preview` | Show effective content without writing |
| `npm run validate` | Validate agents/rules + family drift guard |
| `npm run validate:json` | Run validate in JSON output mode |
| `npm run validate:agents` | Validate agent definitions only |
| `npm run validate:rules` | Validate rule definitions only |
| `npm run validate:drift` | Validate family drift for `drift_guard.enabled: true` families |
| `npm run typecheck` | TypeScript type check for scripts/tests |
| `npm run lint` | ESLint check for scripts/tests (warnings also fail) |
| `npm run verify` | Canonical verify (validate + typecheck + lint + unit/contract) |
| `npm run test:unit` | Run unit + contract tests |
| `npm run test:coverage` | Run unit + contract tests with coverage gate (80%) |
| `npm run smoke:onboarding` | Smoke test the onboarding flow |

Claude sync (`sync:claude*`) writes to `~/.claude/skills/mantra*/SKILL.md` to avoid breaking the `~/.claude/agents` / `~/.claude/rules` symlinks.

## Harness Engineering / MVH

The canonical reference for the Minimum Viable Harness (MVH) across repos is [docs/harness-engineering.md](./docs/ja/harness-engineering.md).

Related templates:

- [templates/repo-agents-pointer.md](./templates/repo-agents-pointer.md) — thin AGENTS.md template
- [templates/repo-pre-push.example.sh](./templates/repo-pre-push.example.sh) — repo pre-push hook template
- [templates/repo-obsidian-ledger.md](./templates/repo-obsidian-ledger.md) — session continuity ledger template

This set defines:

- A pointer-style `AGENTS.md` readable on one screen
- A single canonical verify command per repo
- A test ladder: unit / visual / acceptance
- Division of responsibility between PreToolUse / PostToolUse / Stop and repo hooks
- The continuity contract using `maw handover/takeover` and the Obsidian ledger

---

## User-Defined Content

User-defined `agents/rules/templates/examples` outside `mantra/` can be handled alongside core definitions.
This feature is operated as **Stable**.

Primary configuration (recommended):
- `~/.config/mantra/sources.json`
  - `roots`, `agentsDirs`, `rulesDirs`, `templatesDirs`, `examplesDirs`

Compatible fallback (existing):
- `MANTRA_USER_CONTENT_ROOTS`
  - Example: `/Users/nil/my-mantra-extra,/Users/nil/team-mantra`
  - Loads `agents/`, `rules/`, `templates/`, `examples/` under each root
- `MANTRA_USER_AGENTS_DIRS`, `MANTRA_USER_RULES_DIRS`, `MANTRA_USER_TEMPLATES_DIRS`, `MANTRA_USER_EXAMPLES_DIRS`
  - Direct per-type specification (comma-separated)

Notes:
- When filenames conflict, the source loaded later takes precedence.
- Conflict policy covers filename collisions only; emits `W_SOURCE_CONFLICT_FILENAME` warning and prefers the user-defined file.
- Families are defined as `*.family/{family.yml,base.md,overlays/*}`.
- `family.yml.targets` specifies overlay names (e.g. `codex`); resolves `overlays/<name>.md`.
- `family.yml.drift_guard` (opt-in) enforces the drift contract (`enabled`, `max_overlay_ratio`).
- Lock marker syntax: `<!-- mantra-lock:<id>:start -->` / `<!-- mantra-lock:<id>:end -->`.
- Ongoing operational contracts and structured outputs belong in `base.md`; overlays stay thin, containing only per-target diffs.
- Inspect family composition results with `npm run sync:codex:preview` / `npm run sync:codex:preview:json`.
- When a legacy file and a family within the same source produce the same output name, the family takes precedence and a warning is emitted.
- Duplicate agent/rule names (legacy + family) cause `E_INPUT_INVALID` failure in `validate:agents|validate:rules`, not a warning.
- `drift_guard` violations fail as `E_FAMILY_DRIFT` in `validate:drift`.
- For types that have user-defined or family configuration, `setup` merges into `~/.mantra/generated/*` and links to `~/.claude/agents|rules`.

Roadmap position:
- This is the flagship Phase 4 (user value) initiative, built on the foundation established in Phases 2/3 (operability and consistency).

---

## CI / CD

This repository uses GitHub Actions to run automated validation:

- **On pull request create/update**
- **On push to main branch**

**Validation steps:**
1. Install dependencies (`npm ci`)
2. Validate agents/rules definitions (`npm run validate`)
3. TypeScript type check (`npm run typecheck`)
4. ESLint (`npm run lint`)
5. Unit/contract tests + coverage gate (`npm run test:coverage`)
6. Onboarding smoke test (`npm run smoke:onboarding`)

**Node.js version:**
- CI environment: Node.js v20
- Recommended local environment: Node.js v20+

Workflow definition: `.github/workflows/validate.yml`

---

## Mob Programming (Experimental)

As an optional feature for complex tasks, mantra includes agents and rules for **mob programming orchestration**.

### Why mob programming?

Mob programming improves decision quality and implementation safety in these situations:

- Changes spanning **3+ implementation steps**
- Changes touching **multiple files/layers**
- **Architectural or API tradeoffs**
- **High-risk domains** (auth, security, billing, migrations)

### When NOT to use

- Typo fixes, trivial formatting changes
- Small one-file edits with obvious implementation
- Test snapshots without behavior changes

### Included mob roles

| Role | Description |
|------|-------------|
| `mob-navigator` | Orchestrates decision flow and sequences which specialists to call |
| `mob-critic` | Challenges assumptions, finds risks, identifies failure modes |
| `mob-scribe` | Normalizes and summarizes multi-agent outputs |

### Recommended modes

| Mode | When to use | Typical participants |
|------|-------------|---------------------|
| **flash-mob** | Preflight risk scanning before implementation | planner, architect, mob-critic, mob-navigator |
| **plan-mob** | Lock plan and acceptance criteria | planner, architect, tdd-guide, mob-critic, mob-scribe |
| **review-mob** | Merge readiness review | code-reviewer, security-reviewer, mob-critic, mob-scribe |

### Quickstart

```bash
# Get started in 5 minutes
cat MOB_QUICKSTART.md

# See examples
ls examples/ja/mob-*-example.md

# Detailed rules
cat rules/mob-programming.md
```

### Related docs

- `MOB_QUICKSTART.md` — Get started in 5 minutes (Japanese; see `rules/mob-programming.md` for the English protocol)
- `rules/mob-programming.md` — Complete protocol and anti-patterns
- `examples/` — Execution examples for flash-mob, plan-mob, review-mob
- `docs/ja/mob-role-boundaries.md` — Role boundaries and selection guide
- `templates/mob-*.md` — Templates (plan/review/decision-log)

---

## Documentation

| Document | Description |
|----------|-------------|
| [Harness Engineering](./docs/ja/harness-engineering.md) | Canonical repo adoption path (adoption path / MVH) |
| [Authoring Guide](./docs/ja/authoring.md) | Guide to authoring agents and rules |
| [CLI Contract](./docs/ja/cli-contract.md) | `--json` output, error_code, and exit code contract |
| [Ops Metrics](./docs/ja/ops-metrics.md) | KPI definitions, measurement events, `metrics:report` aggregation granularity |
| [Troubleshooting](./docs/ja/troubleshooting.md) | Recovery procedures per `error_code` |
| [Mob Programming](#mob-programming-experimental) | Orchestration for complex tasks |

---

## License

MIT (see LICENSE)
