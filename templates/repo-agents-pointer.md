# Agent Operations (<repo>)

## Purpose
- このファイルは bounded repo improvement の運用入口のみを定義する。
- 仕様や背景は SSOT に寄せ、このファイルへ再掲しない。

## Canonical Verify
- `<canonical verify command>`

## Test Ladder
- `default`: `<unit/lint/typecheck/contract>`
- `visual`: `<when to run visual regression>`
- `acceptance`: `<when to run acceptance or E2E>`

## Session Continuity
- source of truth は `maw handover/takeover`
- Obsidian ledger には `repo / branch_or_workspace / goal / blockers / next_step / evidence_refs` を残す

## Canonical Docs
- `README.md`
- `<repo harness doc>`
- `<repo runbook>`

## Non-Goals
- 長い運用メモの再掲
- 実装仕様の説明
- 詳細 runbook の複製
