# Troubleshooting

`--json` で実行すると、失敗時に `error_code` が返ります。  
このページは `error_code` ごとの最短対処をまとめたものです。

## Warning（非致命）

`type: "warning"` は失敗ではありません。  
ソース間で filename 衝突がある場合、`W_SOURCE_CONFLICT_FILENAME` warning を出してユーザー定義を優先します。

warning code:
- `W_SOURCE_CONFLICT_FILENAME`

確認:
- `npm run setup -- --json`
- `npm run onboarding:json`

見方:
- `winner: "user"` と `loser` を確認し、どちらが採用されたかを判断する
- 注意: agent/rule の name 重複は warning ではなく、`E_INPUT_INVALID` エラーです
- 注意: family 出力の衝突も warning ではなく、`E_INPUT_INVALID` エラーです

## E_ENV_NODE_VERSION

- 症状: Node.js バージョン不足
- 確認: `node -v`
- 対処: Node.js v20+ に更新

## E_FS_PERMISSION

- 症状: 読み取り/書き込み権限不足
- 確認: `ls -la ~/.claude ~/.codex ~/.mantra`
- 対処:
  - ディレクトリ権限を修正
  - 権限不足のパスを削除または所有者変更

## E_SCHEMA_FRONTMATTER

- 症状: `agents/*.md` frontmatter の形式不正
- 確認: `npm run validate:agents -- --json`
- 対処:
  - frontmatter が `---` で始まり `---` で終わることを確認
  - `name`, `description` を必須で定義

## E_SCHEMA_RULE

- 症状: `rules/*.md` メタデータ解釈失敗
- 確認: `npm run validate:rules -- --json`
- 対処:
  - ファイル名が安全文字（英数字/`-`/`_`）のみであることを確認
  - H1 見出しが空でないことを確認

## E_SYNC_OUTPUT_PATH

- 症状: 同期出力先パスが拒否される（安全性チェック）
- 確認: `npm run sync:codex:agents -- --json`
- 対処:
  - 出力先が `~/.codex/skills/mantra*` 配下であることを確認
  - 手動で不正なシンボリックリンクを作成していないか確認

## E_INPUT_INVALID

- 症状: 入力値/設定不正（例: agent/rule の name 重複、family 出力の形式不正/重複、sources.json の JSON/スキーマ不正）
- 確認:
  - `npm run validate:agents -- --json`
  - `npm run validate:rules -- --json`
- 補足:
  - 重複 name の場合は `type: "error"` 行の `error_code` に `E_INPUT_INVALID` が出力されます
  - `type: "validated"` 行の `outputs.legacy` / `outputs.family` を見ると、衝突している出力名を特定できます
- 対処:
  - agent/rule の `name` を一意にする
  - family 出力名（`families` / `mantra-families`）を一意かつ安全文字にする
  - `~/.config/mantra/sources.json` の JSON とスキーマを修正する

## E_IO / E_INTERNAL

- 症状: 想定外の I/O 失敗または内部エラー
- 確認:
  - `npm run validate:json`
  - `npm run sync:codex:json`
- 対処:
  - 再現コマンドと `error_code` を収集
  - `~/.mantra/metrics/*.jsonl` を確認して直前イベントを特定

## `sources.json` の検証

主設定ファイル: `~/.config/mantra/sources.json`

確認項目:
- JSON構文が正しいか
- path が存在するか（存在しないpathは無視される）
- 優先順が意図通りか（core -> roots -> kind別Dirs -> ENV fallback）

簡易確認:
1. `npm run validate:json`
2. `npm run setup -- --json`
3. warning イベント（`W_SOURCE_CONFLICT_FILENAME`）で採用元を確認

## 最短診断フロー

1. `npm run onboarding:json`
2. `npm run setup -- --json`
3. `npm run validate:json`
4. warning/error を確認して上記セクションの対処を実施
5. `npm run smoke:onboarding` で再検証
