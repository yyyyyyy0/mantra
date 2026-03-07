# CLI Contract

`mantra` の `setup/sync/validate` 系 CLI は、従来の人間向け出力に加えて `--json` をサポートします。
`metrics:report` は例外で、`--json` 時に JSON Lines ではなく単一 JSON object を返します。

`sync:codex` は互換エイリアスで、正規経路は対象別 subcommand（`sync:codex:agents|rules|templates|examples`）です。

## 互換性ポリシー

- デフォルト出力（人間向け）は維持
- `--json` はオプトイン機能
- 既存の成功/失敗の終了コード互換を維持（成功: `0`, 失敗: `1`）

## JSON 出力イベント

標準出力に JSON Lines 形式で出力します。

### 成功/失敗サマリ（必須）

```json
{
  "type": "summary",
  "command": "validate:agents",
  "success": true,
  "duration_ms": 42,
  "error_code": "E_SCHEMA_FRONTMATTER",
  "retryable": false,
  "details": {
    "warning_count": 0
  }
}
```

`validate:agents` / `validate:rules` で複数ファイルエラーがある場合、`summary.error_code` は各 `type: "error"` の代表値として次の優先順位で決定します。

- `E_INPUT_INVALID`
- `E_FAMILY_DRIFT`
- スキーマ系（`validate:agents` は `E_SCHEMA_FRONTMATTER`、`validate:rules` は `E_SCHEMA_RULE`）
- その他のエラーコード（検出順の先頭）

### ファイル単位イベント（任意）

- `type: "validated"`: validate 系でのファイル検証成功
- `type: "drift_checked"`: validate:drift の family 検証成功
- `type: "synced"`: sync 系でのファイル同期成功
- `type: "error"`: ファイル単位エラー
- `type: "drift_error"`: validate:drift の drift 検証失敗
- `type: "warning"`: 衝突などの非致命イベント

### validate イベント契約（legacy / family）

`validate:agents` / `validate:rules` の `type: "validated"` には、検証対象の出力情報として `source_kind` / `output_name` を含みます。

```json
{
  "type": "validated",
  "command": "validate:agents",
  "file": "/path/to/agents/planner.family",
  "success": true,
  "source_kind": "family",
  "output_name": "planner"
}
```

- `source_kind`: `legacy` または `family`
- `output_name`: 実際に出力される名前
- 一意性は `legacy + family` の合成集合で判定されます（衝突時は `E_INPUT_INVALID`）

### validate:drift イベント契約

`validate:drift --json` は、`drift_guard.enabled: true` の family に対して drift 検証を行います。

```json
{
  "type": "drift_checked",
  "command": "validate:drift",
  "kind": "agents",
  "file": "/path/to/agents/planner.family",
  "source_kind": "family",
  "output_name": "planner",
  "max_overlay_ratio": 0.2,
  "checked_targets": ["claude", "codex", "generic"],
  "success": true
}
```

```json
{
  "type": "drift_error",
  "command": "validate:drift",
  "kind": "agents",
  "file": "/path/to/agents/planner.family",
  "source_kind": "family",
  "output_name": "planner",
  "target": "codex",
  "message": "overlay ratio exceeded ...",
  "error_code": "E_FAMILY_DRIFT",
  "retryable": false,
  "violation_code": "OVERLAY_RATIO_EXCEEDED",
  "details": {}
}
```

- `drift_guard.enabled: false`（または未指定）の family はスキップされます
- `summary.details` には以下を含みます:
  - `families_seen`
  - `families_checked`
  - `families_failed`
  - `violations`

### sync preview 契約

`sync:codex:* --json --preview` は、書き込みをせずに effective content を返します。

```json
{
  "type": "preview_base",
  "command": "sync:codex:agents",
  "name": "planner",
  "kind": "agents",
  "source_kind": "family",
  "content": "..."
}
```

```json
{
  "type": "preview_generated",
  "command": "sync:codex:agents",
  "name": "planner",
  "kind": "agents",
  "source_kind": "family",
  "tool": "codex",
  "content": "..."
}
```

- `tool`: `claude` / `codex` / `generic`
- `summary.details.previewed`: preview 件数

### warning イベント契約

```json
{
  "type": "warning",
  "command": "setup",
  "code": "W_SOURCE_CONFLICT_FILENAME",
  "winner": "user",
  "loser": "core",
  "target": "planner.md",
  "message": "filename conflict detected; user source selected"
}
```

- `code`:
  - `W_SOURCE_CONFLICT_FILENAME`
- `winner`: `user`
- `loser`: `core` または `user:<path>`
- 重複した agent/rule name は warning ではなく、`validate:agents|validate:rules` の `type: "error"` イベントで `E_INPUT_INVALID` を返し、終了コード `1` で失敗
- family ディレクトリ（`*.family`）の形式不正・重複・legacy/family 間衝突も同様に `E_INPUT_INVALID` で失敗
- drift_guard 違反（lock marker 不一致 / overlay 比率超過）は `E_FAMILY_DRIFT` で失敗

## error_code 一覧

- `E_ENV_NODE_VERSION`
- `E_FS_PERMISSION`
- `E_SCHEMA_FRONTMATTER`
- `E_SCHEMA_RULE`
- `E_FAMILY_DRIFT`
- `E_SYNC_OUTPUT_PATH`
- `E_INPUT_INVALID`
- `E_IO`
- `E_INTERNAL`

## 終了コード規約

- `0`: 処理成功
- `1`: 1件以上の処理失敗

warning は失敗扱いにしない（`0`を維持）。

## `metrics:report --json` 契約

`npm run metrics:report -- --json` は単一 JSON object を返します。

```json
{
  "type": "metrics_report",
  "window": {
    "days": 7,
    "from": "2026-03-01",
    "to": "2026-03-07",
    "files_scanned": 7,
    "files_found": 1,
    "records_loaded": 12
  },
  "workflows": [
    {
      "workflow": "onboarding",
      "runs": 1,
      "successes": 1,
      "failures": 0,
      "success_rate": 100,
      "p50_duration_ms": 1234
    }
  ],
  "commands": [
    {
      "command": "setup",
      "runs": 1,
      "successes": 1,
      "failures": 0,
      "success_rate": 100,
      "avg_duration_ms": 321,
      "user_source_runs": 0
    }
  ],
  "top_error_codes": [],
  "top_warning_types": [],
  "top_conflicts": [],
  "skipped_records": 0
}
```

トップレベル required keys:
- `type`
- `window`
- `workflows`
- `commands`
- `top_error_codes`
- `top_warning_types`
- `top_conflicts`
- `skipped_records`

補足:
- `workflows` は `record_kind: "workflow"` row から集計します
- `commands` は `record_kind: "command"` row から集計します
- v1 row は `record_kind: "command"` 相当として読みます
- 不正な row は `skipped_records` に計上されます

## メトリクス記録規約

- 各コマンド終了時に `~/.mantra/metrics/YYYY-MM-DD.jsonl` へ追記
- v2 row の追加項目: `schema_version`, `record_kind`, `session_id`, `workflow`, `user_source_count`, `warning_details`
- 既存 row との後方互換は維持し、reader は v1/v2 混在を許容する
