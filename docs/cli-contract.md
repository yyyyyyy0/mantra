# CLI Contract

`mantra` の `setup/sync/validate` 系 CLI は、従来の人間向け出力に加えて `--json` をサポートします。

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
- スキーマ系（`validate:agents` は `E_SCHEMA_FRONTMATTER`、`validate:rules` は `E_SCHEMA_RULE`）
- その他のエラーコード（検出順の先頭）

### ファイル単位イベント（任意）

- `type: "validated"`: validate 系でのファイル検証成功
- `type: "synced"`: sync 系でのファイル同期成功
- `type: "error"`: ファイル単位エラー
- `type: "warning"`: 衝突などの非致命イベント

### validate preview 契約（legacy / family 出力）

`validate:agents` / `validate:rules` の `type: "validated"` には、出力プレビューとして `outputs` を含みます。

```json
{
  "type": "validated",
  "command": "validate:agents",
  "file": "/path/to/agents/planner.md",
  "success": true,
  "outputs": {
    "legacy": ["planner"],
    "family": ["planning", "orchestration"]
  }
}
```

- `outputs.legacy`: 既存（legacy）出力名
- `outputs.family`: family 出力名（未指定なら空配列）
- 一意性は `legacy + family` の合成集合で判定されます（どちらかの衝突でも `E_INPUT_INVALID`）

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
- family 出力の形式不正・重複・legacy/family 間衝突も同様に `E_INPUT_INVALID` で失敗

## error_code 一覧

- `E_ENV_NODE_VERSION`
- `E_FS_PERMISSION`
- `E_SCHEMA_FRONTMATTER`
- `E_SCHEMA_RULE`
- `E_SYNC_OUTPUT_PATH`
- `E_INPUT_INVALID`
- `E_IO`
- `E_INTERNAL`

## 終了コード規約

- `0`: 処理成功
- `1`: 1件以上の処理失敗

warning は失敗扱いにしない（`0`を維持）。

## メトリクス記録規約

- 各コマンド終了時に `~/.mantra/metrics/YYYY-MM-DD.jsonl` へ追記
- 出力項目: `timestamp`, `command`, `duration_ms`, `success`, `error_code`
