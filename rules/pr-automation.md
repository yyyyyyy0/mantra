# PR Automation

## Overview

PR のリスク分類に基づき、低リスク PR は自動 merge、中〜高リスクは人間ゲートを維持する。

## Risk Levels

| Level | Conditions | Action |
|-------|-----------|--------|
| `risk:low` | docs only / deps patch (Dependabot/Renovate) / generated files / tests only | Auto-merge after CI + AI review green |
| `risk:medium` | Above以外、高リスクパスなし | AI review comment + human approve required |
| `risk:high` | auth, migrations, CI config, billing, infra, security paths | Human review required + security check |

## Workflows

- **`risk-classifier.yml`**: PR の diff パスを解析し `risk:low/medium/high` ラベルを付与
- **`ai-review.yml`**: PR 作成時に `pending` status を投稿。ローカルレビュー待ちを示す
- **`auto-merge.yml`**: `risk:low` + 全 check green + AI critical なし → `gh pr merge --auto --squash`

## Local AI Review

AI review は GitHub Actions 内ではなく、ローカルの Claude Code CLI で実行する。

### 自動実行（PostToolUse hook）

Claude Code で `gh pr create` を実行すると、PostToolUse hook がバックグラウンドで `scripts/pr-review.sh` を起動する。レビュー結果は PR コメント + commit status として GitHub に投稿される。

### 手動実行

```bash
npm run review:pr -- <PR番号>
```

Claude Code 外で PR を作成した場合や、再レビューが必要な場合に使用する。

### 処理フロー

```
gh pr create → PostToolUse hook 発火 → scripts/pr-review.sh (background)
  1. gh pr diff で diff 取得（100KB で truncate）
  2. claude -p --model sonnet で AI review 実行
  3. gh pr comment でレビュー結果を PR コメントに投稿
  4. gh api statuses/ で commit status 設定
     → success: critical なし → auto-merge 候補
     → failure: critical あり → auto-merge ブロック
```

## Escape Hatches

- **`no-auto-merge` ラベル**: 手動で付与すると `risk:low` でも自動 merge を抑制
- **`auto-merged` ラベル**: 自動 merge された PR に付与（監査用）

## Configuration

高リスクパス定義は `.github/risk-paths.json` でプロジェクトごとにカスタマイズ可能。

## Prerequisites

- `claude` CLI がインストール済みで OAuth 認証済み（`claude --version` で確認）
- `gh` CLI が認証済み（`gh auth status` で確認）
- `jq` がインストール済み（`jq --version` で確認。PR メタデータのパースに使用）

## Branch Protection Settings

`main` ブランチに以下を設定:

```
Required status checks:
  - validate
  - typecheck / lint / test:coverage (validate job 内)
  - classify (risk-classifier)
  - ai-review/critical-findings (commit status — ローカルスクリプトが投稿)

Required reviews:
  - 1 approval (risk:medium, risk:high のみ — GitHub の CODEOWNERS や ruleset で制御)

Auto-merge: enabled
```

## Security Considerations

- **Expression injection 防止**: PR title, body, diff はすべて env 変数経由またはファイル経由で渡す
- **Config tamper 防止**: `risk-paths.json` は base branch (`main`) から checkout する
- **AI review gate**: commit status (`ai-review/critical-findings`) で判定する。PR コメントは参考情報のみ
- **Fail-closed**: Claude CLI 失敗時・レスポンス異常時は `failure` status を投稿し、自動 merge をブロック
- **Prompt injection 緩和**: reviewer 指示はプロンプト先頭に配置。diff 内の指示は無視するよう明記
- **Pending = blocked**: レビュー未実行時は `pending` のまま残り、auto-merge はブロックされる
- **Action pinning**: GitHub Actions は commit SHA でピン留め

## Rollout

1. mantra で先行導入して動作確認
2. テンプレート (`~/.claude/templates/pr-automation/`) を他プロジェクトにコピー
3. 各プロジェクトの `.github/risk-paths.json` をカスタマイズ
4. 将来的に reusable workflow (`workflow_call`) として共通リポジトリに集約
