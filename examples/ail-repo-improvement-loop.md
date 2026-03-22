# Example: 1-Round Repo Improvement with autonomous-improvement-loop

このウォークスルーでは、架空の repo `my-project` に mantra の AIL ハーネスを導入し、1 round の改善サイクルを回す流れを示す。

---

## 前提: thin AGENTS.md を設置する

[templates/repo-agents-pointer.md](../templates/repo-agents-pointer.md) をベースに、repo のルートに `AGENTS.md` を置く。

```markdown
# Agent Operations (my-project)

## Purpose
- lint/typecheck 警告の段階的削減と test coverage 向上

## Canonical Verify
- `npm run verify`

## Test Ladder
- `default`: `npm run verify` (unit + lint + typecheck)
- `visual`: Storybook snapshot（UI 変更時のみ手動実行）
- `acceptance`: Playwright E2E（リリース前ゲートのみ）

## Session Continuity
- source of truth は `maw handover/takeover`
- Obsidian ledger には `repo / branch_or_workspace / goal / blockers / next_step / evidence_refs` を残す

## Canonical Docs
- `README.md`
- `docs/architecture.md`

## Non-Goals
- 長い運用メモの再掲
- 実装仕様の説明
- 詳細 runbook の複製
```

---

## Step 1: Baseline verify

まず canonical verify でベースラインを確認する。

```bash
$ npm run verify
> validate: ✓
> typecheck: 3 errors
> lint: 5 warnings (treated as errors)
> test:unit: 42 passed, 2 failed
# Exit code: 1
```

baseline に問題がある状態。AIL はこの状態を検知し、改善対象として扱う。

---

## Step 2: AIL round 1 を実行する

`autonomous-improvement-loop` を起動する。AIL は issue queue を構築し、1 issue を選択して bounded fix を行う。

### Queue inspection

AIL がまず状態を検査し、issue queue を構築する：

```
Queue:
1. [HIGH confidence] typecheck error in src/utils/date.ts — missing null check (1 file, ~5 lines)
2. [HIGH confidence] lint warning in src/api/handler.ts — unused import (1 file, ~2 lines)
3. [MEDIUM confidence] test failure in tests/auth.test.ts — outdated mock (1-2 files, ~20 lines)
4. [LOW confidence] lint warnings in src/components/*.tsx — implicit any (5+ files)
```

### Issue selection

AIL は confidence が高く、blast radius が小さく、verify しやすい issue を優先する：

```
Selected: #1 — typecheck error in src/utils/date.ts (HIGH confidence, 1 file, easy to verify)
```

### Bounded fix

AIL が最小限の変更を行う：

```diff
--- a/src/utils/date.ts
+++ b/src/utils/date.ts
@@ -12,7 +12,7 @@
 export function formatDate(date: Date | null, format: string): string {
-  return date.toLocaleDateString(undefined, parseFormat(format))
+  if (date === null) {
+    return ''
+  }
+  return date.toLocaleDateString(undefined, parseFormat(format))
 }
```

変更予算の使用量: 1 file changed, 4 lines added — 予算内（max 3 files / 200 lines）。

---

## Step 3: Post-fix verify

canonical verify を再実行して改善を確認する。

```bash
$ npm run verify
> validate: ✓
> typecheck: 2 errors (was 3 → 1 fixed)
> lint: 5 warnings
> test:unit: 43 passed, 1 failed (was 2 failed → 1 fixed: date.test.ts now passes)
# Exit code: 1 (remaining issues exist, but progress was made)
```

---

## Step 4: Round summary

AIL が構造化された round summary を出力する：

```
[AIL][r01]
objective: typecheck error 削減
selected_issue: src/utils/date.ts の null check 漏れ
changes: src/utils/date.ts (+4 lines)
verify: typecheck errors 3→2, test failures 2→1
outcome: landed
risk: low
commit: fix: add null check to formatDate
next: lint warning 削減 or 残り typecheck error 修正を次 round で検討
```

---

## Step 5: Final handoff

AIL が停止し、final handoff summary を残す：

```
stop_reason: 1 round 完了、user steer 待ち
stable_state: branch ail/r01-date-null-check, commit pushed, verify partial pass
landed_rounds: 1
open_blockers: なし
remaining_risks: low — 残り typecheck error 2 件、lint warning 5 件
next_best_candidates:
  1. typecheck error in src/api/types.ts (HIGH confidence)
  2. lint unused import in src/api/handler.ts (HIGH confidence)
  3. test mock update in tests/auth.test.ts (MEDIUM confidence)
recommended_escalation: なし（残り issue は AIL で対応可能）
```

### Obsidian ledger 記録例

```yaml
repo: my-project
branch_or_workspace: ail/r01-date-null-check
goal: typecheck error と test failure の段階的削減
blockers: なし
next_step: round 2 で typecheck error in src/api/types.ts を修正
evidence_refs: [AIL][r01] summary
updated_at: 2026-03-22
source_of_truth: maw_handover
```

---

## 次回: Round 2 以降

次のセッションで `autonomous-improvement-loop` を再起動すると：

1. handoff summary から前回の状態を復元
2. issue queue を再構築（前回の修正を反映）
3. 次の issue を選択して bounded fix
4. verify → summary → handoff

このサイクルを繰り返すことで、repo の品質が段階的に向上する。
