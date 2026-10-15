# Working Agreement

## Before starting

- In a git repo, run `git fetch origin main` and check how the current branch differs from `origin/main` before investigating, designing, or implementing.
- Do multi-step changes in a worktree (`claude -w`, a git worktree, or a maw workspace), not in a checkout other things depend on.
- If `git status` shows changes you did not make, never stage or commit them; move your work to a worktree.
- Before building something new, check whether an existing tool, library, or skill already does it, and say what you found.

## While working

- Delete files with `trash`; `rm -rf` is blocked by a hook.
- After a visible UI change, take a screenshot and show it to the user before the next step.
- When behavior changes and the repo has tests, add or update them; follow its coverage gate if it has one.
- Match the surrounding code's style; leave no debug logging such as `console.log`.

## Commits and PRs

- Commit messages: `<type>: <description>` with type one of feat, fix, refactor, docs, test, chore, perf, ci.
- Before marking a PR ready: run the repo's verify command, make sure `code-reviewer` (or `/code-review`) saw the final diff, and include a test plan in the description.
- Merge only with the user's approval.
