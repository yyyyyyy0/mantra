# Agent Orchestration

> Primary workflow は `autonomous-improvement-loop`（既存 repo の bounded 継続改善）。
> Repo 導入の詳細は [docs/harness-engineering.md](../docs/harness-engineering.md) を参照。

<!-- Decision record (Issue #27):
  P0-P4 ラダーとエージェントテーブルは Claude Code runtime の運用ガイダンスとして維持する。
  narrative 上の位置づけ（flagship workflow, adoption path）は README と docs が担う。
  このファイルは operational guidance に徹し、marketing messaging を持たない。 -->

## Available Agents

Located in `~/.claude/agents/`:

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| planner | Implementation planning | Complex features, refactoring |
| replan | Review-driven re-planning | After review when High/Medium issues remain unresolved |
| architect | System design | Architectural decisions |
| tdd-guide | Test-driven development | New features, bug fixes |
| code-reviewer | Code review | After writing code |
| security-reviewer | Security analysis | Before commits |
| build-error-resolver | Fix build errors | When build fails |
| e2e-runner | E2E testing | Critical user flows |
| refactor-cleaner | Dead code cleanup | Code maintenance |
| doc-updater | Documentation | Updating docs |
| mob-navigator | Decision flow orchestration | Non-trivial tasks with multiple decision points |
| mob-critic | Risk finder & challenger | Challenging assumptions, preventing groupthink |
| mob-scribe | Decision/risk summary | Normalizing collaboration outputs |

## Immediate Agent Usage (Conditional)

No user prompt is needed to follow the default ladder, but there is no default agent storm.

Use this sequence:

- **P0 (Default single-agent path)**  
  - Typo / formatting / docs-only small fixes  
  - One-file obvious edits  
  - No architectural decision needed

- **P1 (planner condition)**  
  - 3+ implementation steps  
  - 2+ files  
  - Ambiguous requirements or non-trivial behavior choices  
  - If any condition applies, invoke **planner**

- **P2 (replan condition)**  
  - Run only after `planner` or design review outputs exist
  - Review shows unresolved High/Medium risks (`High + Medium > 0`)
  - Use **replan** to rebuild execution plan before implementation
  - Do not use for trivial one-file or obvious edits
  - Do not run `planner` and `replan` in the same round

- **P3 (mob condition)**  
  - High-risk scope (security, auth, billing, migrations, data integrity)  
  - Repeated unresolved decision points after `planner` / `replan`  
  - Escalate to `mob-*` only when multi-perspective value is clear

- **P4 (code-reviewer condition)**  
  - Non-trivial code changes  
  - Invoke **code-reviewer** after writing code, not before obvious docs-only edits

Suggested escalation:
- `single-agent` → `planner` (if P1) → `replan` (if P2) → `mob-navigator`/`mob-critic`/`mob-scribe` (if P3) → `code-reviewer` (if P4)

## Plan / Execute Split

Keep planning and execution separate when:

- work spans 3+ implementation steps
- change touches multiple files and alters behavior
- auth / migration / billing / data-loss risk exists
- rollback is hard

In those cases:

- use a planner first
- keep `AGENTS.md` thin and point to SSOT docs instead of embedding long playbooks
- expose one canonical verify command and one test ladder per repo

See [docs/harness-engineering.md](../docs/harness-engineering.md) and
[templates/repo-agents-pointer.md](../templates/repo-agents-pointer.md).

## Parallel Task Execution

ALWAYS use parallel Task execution for independent operations:

```markdown
# GOOD: Parallel execution
Launch 3 agents in parallel:
1. Agent 1: Security analysis of auth.ts
2. Agent 2: Performance review of cache system
3. Agent 3: Type checking of utils.ts

# BAD: Sequential when unnecessary
First agent 1, then agent 2, then agent 3
```

## Multi-Perspective Analysis

For complex problems, use split role sub-agents:
- Factual reviewer
- Senior engineer
- Security expert
- Consistency reviewer
- Redundancy checker

## Mob Orchestration

For complex tasks requiring multi-perspective collaboration, use mob programming:

| Agent | Role | When to Use |
|-------|------|-------------|
| mob-navigator | Orchestrator & decision flow coordinator | Non-trivial tasks with multiple decision points |
| mob-critic | Adversarial reviewer & risk finder | Challenging assumptions, preventing groupthink |
| mob-scribe | Normalizer & documenter | Producing decision/risk/action summaries |

### When to Use Mob Sessions

Use mob orchestration when:
- Task spans 3+ implementation steps
- Change touches multiple files/layers
- Includes architectural or API tradeoffs
- Failure cost is high (security, auth, billing, migrations)

**IMPORTANT**: Start with mob-navigator to decompose decision points before calling specialists. Do not call all agents at once.

### Coordination Protocol

Tagged outputs for structured collaboration:
- `[OBSERVATION]` - established facts
- `[PROPOSAL]` - suggested change
- `[CHALLENGE]` - critique or risk
- `[DECISION]` - accepted/rejected/deferred
- `[RISK]` - risk with severity
- `[ACTION]` - next step

**IMPORTANT**: Always include mob-critic for challenging assumptions. Use mob-scribe to normalize outputs before acting.

See `rules/mob-programming.md` for complete protocol.
