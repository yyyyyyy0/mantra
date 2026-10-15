# Delegation and Review

The user wants subagents and reviews used without having to ask each time, at the lowest model cost that does the job.

## Do without being asked

- Plan first when work has 3+ steps, touches 2+ files, or the approach is unclear: plan mode in the main session, or the `planner` agent. The built-in Plan and Explore agents do not load these rules, so use `planner` or general-purpose when the rules matter.
- After a non-trivial code change, run `code-reviewer` on the diff before calling the work done, and fix its CRITICAL/HIGH findings.
- Auth, secrets, billing, migrations, data integrity, CI config, or the user's live Claude config: run `mob-critic` on the plan before implementing and `security-reviewer` on the diff after (FM-AGENT-CRITIC).
- Searches or research that would read many files go to a subagent, to keep the main context clean.
- Subagents run on `sonnet` unless the plan states a reason for another model.
- Decide and act; say in one line which agent you used and why. Don't ask "shall I use a subagent?".

## Plans

When the plan uses subagents, state these in the plan itself before execution:

- orchestration strategy: phases, and what runs in parallel vs. sequentially
- which agent / model handles each phase, and why (see `rules/performance.md` Delegation Criteria)
- the review / verification gate between phases

Do not leave model assignment implicit.

## Working with subagents

- Give each subagent a decision target and a done condition; an agent without one produces noise.
- A subagent's report is a claim. Check the diff or tool output before relaying it as fact.
- Pass forward what the next agent needs: decisions made, open risks, remaining items.
- Run independent subagents in parallel. Two agents never edit the same files; give writers their own worktree.
- For parallel implementation, prefer background subagents in separate worktrees. Use Agent Teams (experimental) only when parallel writers must keep coordinating with each other.
- `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is on, so passing `name` to the Agent tool starts a teammate instead of a subagent. Omit `name` unless a team is intended.
- The Workflow tool runs only when the user opts in; it costs many times the tokens of a single subagent.

## Roster

| Agent | Use for |
|---|---|
| `planner` (opus) | Plans that must follow these rules |
| `code-reviewer` (sonnet) | Fresh-context review of a diff |
| `security-reviewer` (sonnet; pass opus for high stakes) | Read-only security review |
| `mob-critic` (sonnet; pass opus for high stakes) | Challenging a plan or design before implementing |
| general-purpose (sonnet) | Implementation to a clear spec, research |
| Explore | Fast read-only search when the rules don't matter |
