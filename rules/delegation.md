# Delegation and Review

The user wants subagents and reviews used without having to ask each time, at the lowest model cost that does the job.

## Do without being asked

- Work with 3+ steps, 2+ files, or an unclear approach: read the `nil-mode` skill first. It routes through pstack and lists where this user differs from it.
- Plan first for that work: plan mode in the main session, or the `planner` agent. The built-in Plan and Explore agents do not load these rules, so use `planner` or general-purpose when the rules matter.
- Show the plan and wait for the user's OK only when it touches the high-risk list below. Otherwise show it and proceed.
- Implementation beyond a few lines that a plan or spec fully describes goes to a sonnet general-purpose subagent; the main session plans, integrates, and checks the diff.
- After a code change beyond a few lines (docs-only excluded), run `code-reviewer` on the diff before calling the work done, and fix its CRITICAL/HIGH findings.
- Auth, secrets, billing, migrations, data integrity, CI config, or the user's live Claude config: run `mob-critic` on the plan (or the proposed change) before implementing and `security-reviewer` on the diff after (FM-AGENT-CRITIC).
- Searches or research that would read many files go to a subagent, to keep the main context clean.
- Models: opus for plans and judgment, sonnet for code, research, docs and reviews, haiku for mechanical bulk work. Use each agent's own model and pass `model: sonnet` to general-purpose. Pass opus to a reviewer only for irreversible or live-config changes, and say why. pstack roles follow `rules/pstack-models.md`.
- Do it yourself when the change is a few lines, when diagnosis and fix are one loop, or when you need the result for your own next decision.
- Decide and act; say in one line which agent you used and why. Don't ask "shall I use a subagent?".

## Plans

When the plan uses subagents, state these in the plan itself before execution:

- orchestration strategy: phases, and what runs in parallel vs. sequentially
- which agent / model handles each phase, and why (see `rules/pstack-models.md` and the Models line above)
- the review / verification gate between phases

Do not leave model assignment implicit.

A plan of 3+ phases that uses no subagents says why in one line.

## Working with subagents

- Give each subagent a decision target and a done condition; an agent without one produces noise.
- A subagent's report is a claim. Check the diff or tool output before relaying it as fact.
- Pass forward what the next agent needs: decisions made, open risks, remaining items.
- Run independent subagents in parallel. Two agents never edit the same files; give writers their own worktree.
- For parallel implementation, prefer background subagents in separate worktrees. Use Agent Teams (experimental) only when parallel writers must keep coordinating with each other.
- `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is on, so passing `name` to the Agent tool starts a teammate instead of a subagent. Omit `name` unless a team is intended.
