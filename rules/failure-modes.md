# Named Failure Modes

LLM エージェントが典型的にやらかす「ショートカット行動」の明示的禁止リスト。
各パターンは FM-xxx ID を持ち、ドメインルールファイルから参照される。

## Cross-Cutting Patterns

### FM-READ: 「読んだ」≠「検証した」

Do not treat reading a file, log, or document as verification.
Reading confirms existence, not correctness. If a verification step exists (run tests, check output, call endpoint), execute it.

### FM-PLAUSIBLE: 「もっともらしい」≠「テスト済み」

Do not treat a likely-correct fix as a confirmed fix.
If the fix can be tested in under 60 seconds, test it before declaring it done.

### FM-SKIP-CHECK: 検証ステップを省略しない

Do not skip a verification step that is available and takes seconds.
"It should work" is not evidence.

### FM-SUMMARY: 検索要約 ≠ 実装確認

Do not treat search result summaries or code comments as proof of implementation.
Trace through the actual execution path.

### FM-RETRY: 拒否されたツール呼び出しを同一引数で再試行しない

If a tool call is denied, do not re-issue the same call unchanged.
Understand why it was denied, adjust the approach, or ask the user.

### FM-VAGUE: 漠然とした質問をしない

Do not ask broad clarifying questions when a specific missing piece can be identified.
"Is the return type string or number?" not "Can you tell me more about the requirements?"

## Domain-Specific Patterns

### FM-TEST-PASS: ユニットテスト通過 ≠ フロー全体の証明

A passing unit test does not prove the feature works end-to-end.
When integration or E2E verification is available, use it.

### FM-TEST-FIX: テストではなく実装を直す

When a test fails, the default assumption is the implementation is wrong.
Do not modify test expectations to match broken behavior unless the test itself is incorrect.

### FM-SEC-INTERNAL: 内部入力も安全ではない

Do not assume input from internal services or trusted sources is safe.
Validate at every system boundary.

### FM-SEC-SILENCE: 「エラーなし」≠「安全」

The absence of error messages does not mean the code is secure.
Actively verify security properties (auth, authz, injection, secrets exposure).

### FM-GIT-AMEND: フック失敗後に amend しない

When a pre-commit hook fails, the commit did not happen.
Create a new commit after fixing — do not use `--amend`, which would modify the previous commit.

### FM-GIT-NOVERIFY: フックやパーミッションガードをスキップしない

Do not use `--no-verify`, `--no-gpg-sign`, or `dangerously-skip-permissions` to bypass failing hooks or permission guards.
Fix the underlying issue instead.

### FM-CODE-SCOPE: 無関係なコードを整理しない

Do not refactor, rename, or reorganize code outside the scope of the current task.
Use `refactor-cleaner` as a separate step after the feature is committed.

### FM-CODE-CREEP: 要求以上の機能を追加しない

Implement what was requested. Do not add "while I'm here" improvements.
If you notice something worth improving, note it — do not act on it.

### FM-AGENT-TARGET: 決定対象なしにエージェントを起動しない

Before spawning agents, define what needs to be decided.
Agents without a clear objective produce noise, not insight.

### FM-AGENT-CRITIC: リスクの高い変更でチャレンジ役を省略しない

For security, auth, billing, migration, or data-integrity changes, always include `mob-critic` or equivalent.
Shallow consensus on high-risk changes is itself a failure mode.
