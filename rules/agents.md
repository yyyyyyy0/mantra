# Agent Orchestration

## Available Agents

Located in `~/.claude/agents/`:

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| planner | Implementation planning | Complex features, refactoring |
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

## Immediate Agent Usage

No user prompt needed:
1. Complex feature requests - Use **planner** agent
2. Code just written/modified - Use **code-reviewer** agent
3. Bug fix or new feature - Use **tdd-guide** agent
4. Architectural decision - Use **architect** agent

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
