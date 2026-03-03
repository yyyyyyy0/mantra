# Issue #4 Closeout Checklist (日本語/英語)

## Summary

- Issue: `#4`
- Scope: ドキュメントのみ（コード/API の変更なし）
- Target: `Core / Optional / Experimental` 境界と
  specialist 呼び出し閾値の明文化

## PR 説明テンプレ（コピーして利用）

- [ ] Issue / PR の範囲: `Issue #4` の要件のみ
- [ ] 5 ファイル（`README`, `rules/agents.md`, `rules/mob-programming.md`, `MOB_QUICKSTART.md`, `docs/mob-role-boundaries.md`) の運用契約用語を統一
- [ ] 境界・閾値が常時起動ではなく条件付きになっている（single-agent, planner, code-reviewer, mob）
- [ ] `onboarding`（core）と `onboarding:full`（拡張）境界と整合している
- [ ] コード変更前提の指示（`#1`）に接続せず、実装は未着手

## Manual consistency check items

### Terminology alignment

- [ ] `Core / Optional / Experimental` が5ファイルで同じ意味（既定導線 / 拡張導線 / 実験導線）で使われていること
- [ ] `single-agent / planner / code-reviewer / mob-*` の順序と役割期待が一致していること
- [ ] `overhead` と `停止条件` が `rules/mob-programming.md` と `docs/mob-role-boundaries.md` で一致していること

### Conditional invocation checks

- [ ] `rules/agents.md`: 即時起動の列挙なし（条件付きロジック）
- [ ] `rules/mob-programming.md`: 期待便益 > 期待コスト時のみ
- [ ] `MOB_QUICKSTART.md`: `flash/plan/review-mob` が条件分岐で選択されている
- [ ] `docs/mob-role-boundaries.md`: small/medium/large/high-risk の分類が README の比較軸と齟齬しない

## Scope boundaries (do not change)

- [ ] 追加 API/実装の変更なし
- [ ] #1 の P0/P1 のコード実装タスクは別イテレーション

## Acceptance statement

- [ ] Issue #4 は「明文化」「条件化」「文書間整合」の3点で完了判定可能
