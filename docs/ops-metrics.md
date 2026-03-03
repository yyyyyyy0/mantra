# Operations Metrics Guide

このドキュメントは、`mantra` CLI の運用指標を定義します。

## North Star KPI

- **オンボーディング成功率**
  - 定義: 初回 `npm ci && npm run setup && npm run validate && npm run sync:codex` の完了率
  - 式: `成功セッション数 / 実行セッション総数`
  - 目標: 6か月で +15pt

## 補助 KPI

- **コマンド失敗率**
  - 対象: `setup`, `validate:agents`, `validate:rules`, `sync:codex:agents`, `sync:codex:rules`, `sync:codex:templates`, `sync:codex:examples`
  - 式: `失敗実行回数 / 実行回数`
- **外部ソース利用率**
  - 定義: 実行時に user source が1つ以上解決された割合
  - 式: `user source 利用実行数 / 実行数`
- **衝突 warning 率**
  - 定義: filename 衝突 warning（`W_SOURCE_CONFLICT_FILENAME`）の発生割合
  - 式: `warning 発生実行数 / 実行数`
  - 補足: agent/rule の name 重複は warning ではなく、`E_INPUT_INVALID` の失敗として「コマンド失敗率」に計上
- **原因特定時間（MTTI）**
  - 定義: 最初の失敗発生から `error_code` と対処手順が特定されるまでの時間
- **初回完了時間（P50）**
  - 定義: onboarding 完了までの中央値時間

## 計測イベント

各 CLI 実行で `~/.mantra/metrics/YYYY-MM-DD.jsonl` に 1 行追加します。

```json
{
  "timestamp": "2026-02-26T07:00:00.000Z",
  "command": "setup",
  "duration_ms": 120,
  "success": true,
  "error_code": "E_SCHEMA_FRONTMATTER",
  "warning_count": 1,
  "warning_types": ["W_SOURCE_CONFLICT_FILENAME"]
}
```

フィールド:
- `timestamp`: ISO-8601 UTC
- `command`: 実行コマンド識別子
- `duration_ms`: 実行時間（ミリ秒）
- `success`: 成否
- `error_code`: 失敗時のみ
- `warning_count`: warning 件数（0含む）
- `warning_types`: warning code の配列

## 匿名化ポリシー

- メトリクスにはファイル本文・個人情報・シークレットを含めない
- ローカル保存のみを前提とし、外部送信は行わない

## 集計粒度

- 日次: 失敗率、件数トレンド
- 週次: KPI 差分、上位 `error_code`、ユーザ優先衝突の上位パターン
- リリース単位（随時）: 前回リリースとの差分確認
