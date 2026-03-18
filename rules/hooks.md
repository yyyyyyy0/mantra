# Hooks System

hook は「便利機能」ではなく、薄いハーネスを常時効かせるための policy-as-code 層として扱います。

詳細契約は [docs/harness-engineering.md](../docs/harness-engineering.md) を参照してください。

## Hook Types

- `PreToolUse`: 実行前の危険操作ガードと隔離 workspace の強制
- `PostToolUse`: 編集直後の軽量 verify と artifact 導線
- `Stop`: verify / handover 漏れの検知

## Required Behavior

### PreToolUse

- `git reset --hard`, `rm -rf`, `sudo`, deploy 系などの高リスク操作をブロックまたは確認する
- dirty tree での直接編集を避け、`maw` / worktree を促す
- 3+ step、高リスク、public contract change は plan-first に戻す

### PostToolUse

- repo の canonical verify command か、その軽量部分集合を実行する
- changed-file 単位で lint / typecheck を優先し、毎回のコストを抑える
- visual / acceptance が必要な変更では runbook や artifact 置き場を示す

### Stop

- 変更があるのに verify 記録が無い場合は警告する
- `maw` workspace 作業なら `maw handover` 未実施を警告する
- `next step` と `evidence refs` が無い継続状態を残さない

## Repo Hook Pairing

editor/tool hook が無い環境でも最低限の品質ゲートを通すため、repo 側には `pre-push` を置きます。

- 1 repo 1 command の canonical verify を呼ぶ
- visual / acceptance は手動 runbook に残す
- ひな形は [templates/repo-pre-push.example.sh](../templates/repo-pre-push.example.sh)

## Auto-Accept Permissions

Use with caution:
- Enable only for trusted, well-defined plans
- Disable for exploratory work
- Never use `dangerously-skip-permissions`

## Todo / Plan Tracking

Use Todo-style tracking to keep multi-step work visible, especially when a task crosses plan / execute boundaries.
