# Agent Teams (Experimental)

## Prerequisites

The following tools must be available in the agent environment (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`):

- `TeamCreate` / `TeamDelete` — team lifecycle management
- `TaskCreate` — task assignment to team members
- `SendMessage` — inter-agent communication within the team

## 3-Layer Model

Agent collaboration is classified into 3 layers; choose based on the nature of the task.

### Layer 0: Single-shot Agent (equivalent to P0)

- **When**: Work that completes in a single spawn
- **Examples**: planner, code-reviewer, build-error-resolver
- **Method**: Spawn via `Agent` tool → receive result → done
- **Same as existing behavior**

### Layer 1: Parallel Agents (equivalent to P1-P3, short-lived mob)

- **When**: Multiple perspectives are needed (e.g., flash-mob / plan-mob), but the parent handles implementation
- **Examples**: spawn planner + architect + mob-critic in parallel → normalize with mob-scribe
- **Method**: Spawn multiple `Agent` instances in parallel (existing mob protocol)
- **Same as existing behavior**

### Layer 2: Team (when P3 conditions are met and parallel implementation is needed)

- **When**: All of the following are true:
  - Parallel implementation creates value (editing 2+ files simultaneously)
  - Work spans multiple turns
  - State sharing between agents is required
- **Examples**:
  - Simultaneous frontend + backend implementation
  - Large-scale refactoring (parallel test fixes + main body changes)
  - Parallel security auditing while applying fixes
- **Method**: `TeamCreate` → `TaskCreate` → spawn specialist agents as teammates → coordinate via `SendMessage` → cleanup

---

## Team Operating Rules

### Launch Conditions

Launch a Team when P3 conditions (see `rules/agents.md`) are met **and** parallel implementation creates value.
For analysis or review alone, Layer 1 (parallel Agent mob) is sufficient.

### Team Composition Patterns

```
# Pattern A: Implementation + Review in parallel
TeamCreate("feat-xxx")
  - lead (general-purpose): task decomposition and coordination
  - implementer (general-purpose, worktree): code implementation
  - reviewer (code-reviewer): diff review

# Pattern B: Frontend + Backend in parallel
TeamCreate("feat-xxx")
  - lead: coordination + test creation
  - frontend (general-purpose, worktree): UI implementation
  - backend (general-purpose, worktree): API implementation

# Pattern C: Refactor + Tests in parallel
TeamCreate("refactor-xxx")
  - lead: coordination
  - refactorer (general-purpose, worktree): code changes
  - test-fixer (general-purpose, worktree): test fixes
```

### Lifecycle

1. **Start**: P3 escalation, or when explicitly instructed to work "in parallel"
2. **Task granularity**: 1 task = 1 commit unit
3. **Coordination**: Inter-member communication via `SendMessage`. Track progress with a shared task list
4. **End**: All tasks complete → shutdown_request → TeamDelete
5. **On failure**: Set the task to blocked and report to lead

### Cost Management

- Team members: **3 maximum** (including lead)
- Assign worktree only to agents that perform implementation
- Shut down members that have been idle for more than 30 minutes

### Codex Integration

The delegation rule to `mcp__codex__codex` is maintained for implementation tasks within a team.
Teammates delegate to Codex, receive the result, and apply it to the worktree.

---

## Layer Selection Flowchart

```
Task received
  │
  ├─ Completable by a single agent? → Layer 0
  │
  ├─ Multiple perspectives needed but implementation is in one place? → Layer 1 (mob)
  │
  └─ Does parallel implementation create value?
      ├─ Yes → Layer 2 (Team)
      └─ No  → Layer 1 (mob)
```

---

## Named Failure Modes

- **FM-AGENT-TARGET**: チーム作成前にタスク目標を定義する。明確なタスクなきチームはリソースを浪費する。
- **FM-SKIP-CHECK**: チームメンバーの出力をマージ前に検証する。並列作業は統合リスクを高める。
- **FM-AGENT-CRITIC**: セキュリティ・認証・課金・マイグレーション変更のチームでは必ずチャレンジ役を含める。

---

## Anti-patterns

### Overuse of Team

- For analysis or review alone, Layer 1 is sufficient. There is no need to pay the Team overhead
- Do not use a Team for a single-file change

### Parallel Editing Without a Worktree

- Multiple agents editing the same file will cause conflicts
- Always assign a worktree to agents that edit in parallel

### Team Without a Lead

- Work diverges without a coordinator
- Always place a lead and assign them responsibility for task decomposition and progress management
