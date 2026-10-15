# Named Failure Modes

Shortcuts that have caused rework for this user. Each has an ID so plans and reviews can cite it.

### FM-PLAUSIBLE: "Looks right" is not "verified"

Reading code, a summary, or a passing unit test is not verification when a broader check exists. Run the check that is available (the repo's verify command, the build, an end-to-end run, a screenshot for UI) and show its output before saying the work is done.

### FM-TEST-FIX: Fix the implementation, not the test

When a test fails, assume the implementation is wrong. Change a test's expectation only when the test itself is wrong, and say why.

### FM-CODE-SCOPE: Stay inside the request

Don't refactor, rename, or add features beyond what was asked. Note "while I'm here" improvements for the user instead of doing them.

### FM-GIT-NOVERIFY: Don't bypass hooks or permission guards

No `--no-verify`, `HUSKY=0`, or similar. When a hook fails, fix the cause; when it blocks a commit, the commit did not happen, so make a new commit rather than amending.

### FM-VERSION: 「最新」≠「指定バージョン」

Do not assume `latest` for a dependency, module, CI workflow, runtime, or game/mod target.
Before building or changing dependencies, read the exact version string from the project's config (manifest, lockfile, `west.yml`, workflow file) and use it verbatim — `1.21.11` is not `1.21.1`.
Check that every module and CI workflow references the same pinned version.

### FM-AGENT-CRITIC: リスクの高い変更でチャレンジ役を省略しない

For security, auth, billing, migration, or data-integrity changes, always include `mob-critic` or equivalent.
Shallow consensus on high-risk changes is itself a failure mode.
