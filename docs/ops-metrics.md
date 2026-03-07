# Operations Metrics Guide

このドキュメントは、`mantra` CLI の運用指標とローカル計測フォーマットを定義します。

## North Star KPI

- **オンボーディング成功率**
  - 定義: `record_kind: "workflow"` の `onboarding` / `onboarding:full` 成功率
  - 式: `成功セッション数 / 実行セッション総数`
  - 目標: 6か月で +15pt

## 補助 KPI

- **コマンド失敗率**
  - 対象: `setup`, `validate:agents`, `validate:rules`, `validate:drift`, `sync:codex:agents`, `sync:codex:rules`, `sync:codex:templates`, `sync:codex:examples`
  - 式: `失敗実行回数 / 実行回数`
- **外部ソース利用率**
  - 定義: 実行時に `user_source_count > 0` だった command record の割合
  - 式: `user source 利用実行数 / 実行数`
- **衝突 warning 率**
  - 定義: filename 衝突 warning（`W_SOURCE_CONFLICT_FILENAME`）の発生割合
  - 式: `warning 発生実行数 / 実行数`
  - 補足: agent/rule の name 重複は warning ではなく、`E_INPUT_INVALID` の失敗として「コマンド失敗率」に計上
- **原因特定時間（MTTI）**
  - 定義: 最初の失敗発生から `error_code` と対処手順が特定されるまでの時間
  - 補足: `E_FAMILY_DRIFT` は drift_guard 契約違反（lock marker/overlay 比率）の専用コード
- **初回完了時間（P50）**
  - 定義: workflow record の `duration_ms` の中央値

## 計測イベント

各 CLI 実行で `~/.mantra/metrics/YYYY-MM-DD.jsonl` に 1 行追加します。
現行実装は v1 row と v2 row の混在読み取りに対応します。

```json
{
  "timestamp": "2026-02-26T07:00:00.000Z",
  "command": "setup",
  "duration_ms": 120,
  "success": true,
  "error_code": "E_SCHEMA_FRONTMATTER",
  "warning_count": 1,
  "warning_types": ["W_SOURCE_CONFLICT_FILENAME"],
  "schema_version": 2,
  "record_kind": "command",
  "session_id": "8e4d4b3b-0a73-49cc-a95a-3be8a2d1d9d1",
  "workflow": "onboarding",
  "user_source_count": 1,
  "warning_details": [
    {
      "code": "W_SOURCE_CONFLICT_FILENAME",
      "target": "planner.md",
      "winner": "user",
      "loser": "core"
    }
  ]
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
- `schema_version`: additive metrics schema version（v2 row のみ）
- `record_kind`: `command` または `workflow`
- `session_id`: 同一 onboarding run / 単発 command run を結ぶ識別子
- `workflow`: `onboarding` / `onboarding:full` に紐づく command row、または workflow row に付与
- `user_source_count`: 解決された user source ディレクトリ数
- `warning_details`: warning の集計用詳細。現在は `W_SOURCE_CONFLICT_FILENAME` の `target/winner/loser` を含む

補足:
- v1 row には `schema_version` / `record_kind` / `session_id` などの追加フィールドが存在しません
- v2 row は additive であり、既存 row の移行は不要です
- metrics write は best-effort で、失敗しても CLI 自体は失敗しません

## ローカル集計

`npm run metrics:report -- --days 7` で直近メトリクスをローカル集計できます。

- 既定: 直近 7 日
- `--json`: 単一 JSON object を出力
- mixed v1/v2 row を同時に読める
- malformed row は `skipped_records` に計上して継続する
- metrics directory が空でも成功扱いで空集計を返す

## 匿名化ポリシー

- メトリクスにはファイル本文・個人情報・シークレットを含めない
- ローカル保存のみを前提とし、外部送信は行わない

## 集計粒度

- 日次: 失敗率、件数トレンド
- 週次: KPI 差分、上位 `error_code`、ユーザ優先衝突の上位パターン
- リリース単位（随時）: 前回リリースとの差分確認
