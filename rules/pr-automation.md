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
- **`ai-review.yml`**: Claude API で diff をレビューし PR コメント + status check として報告
- **`auto-merge.yml`**: `risk:low` + 全 check green + AI critical なし → `gh pr merge --auto --squash`

## Escape Hatches

- **`no-auto-merge` ラベル**: 手動で付与すると `risk:low` でも自動 merge を抑制
- **`auto-merged` ラベル**: 自動 merge された PR に付与（監査用）

## Configuration

高リスクパス定義は `.github/risk-paths.json` でプロジェクトごとにカスタマイズ可能。

## Required Secrets

- `ANTHROPIC_API_KEY`: AI review 用の Claude API キー（GitHub repo secrets に設定）

## Branch Protection Settings

`main` ブランチに以下を設定:

```
Required status checks:
  - validate
  - typecheck / lint / test:coverage (validate job 内)
  - classify (risk-classifier)
  - ai-review

Required reviews:
  - 1 approval (risk:medium, risk:high のみ — GitHub の CODEOWNERS や ruleset で制御)

Auto-merge: enabled
Merge queue: enabled (optional)
```

## Security Considerations

- **Expression injection 防止**: PR title, body, diff はすべて env 変数経由で渡す。shell heredoc や JS テンプレートリテラルに直接展開しない
- **Config tamper 防止**: `risk-paths.json` は base branch (`main`) から checkout する。PR head の変更で分類を操作されることを防ぐ
- **AI review gate**: commit status (`ai-review/critical-findings`) で判定する。PR コメントは参考情報のみで merge 判定に使わない
- **Fail-closed**: AI review API 失敗時・レスポンス異常時は `has_critical=true` として扱い、自動 merge をブロック
- **Prompt injection 緩和**: reviewer 指示は Anthropic API の `system` フィールドに分離。diff 内の指示は無視するよう明記
- **Action pinning**: すべての GitHub Actions は commit SHA でピン留め
- **Secret 管理**: API キーは `env` 変数経由で渡し、inline expression で shell に展開しない

## Rollout

1. mantra で先行導入して動作確認
2. テンプレート (`~/.claude/templates/pr-automation/`) を他プロジェクトにコピー
3. 各プロジェクトの `.github/risk-paths.json` をカスタマイズ
4. 将来的に reusable workflow (`workflow_call`) として共通リポジトリに集約
