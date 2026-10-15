Updated: 2026-10-15

---

## 1. 完了したこと（Done）

mantra の再設計（正本は `docs/MODERNIZATION_PLAN.md`）のうち、P0〜P3 を終えました。

- **P0（安全化）**
  - バックアップを `~/.claude/backups/mantra-redesign-20261015` に取った
  - `auto-merge.yml` を無効にした
  - `settings.json` から p-judge を外した
  - `cleanupPeriodDays` を 120 にした
  - PR #62 をクローズした
  - 計画の PR は #63
- **P1（ルール）**: 常時読み込むルールを 4 ファイルに絞った（`feat/redesign-p1-rules`）。旧ルールとの対応表は `docs/redesign/rules-mapping.md`
- **P2（スリム化）**: エージェントを 4 体にし、`hooks/guard.sh`、`scripts/install.sh`・`deploy.sh`・`verify.sh`、シェルのみの CI を追加した。TypeScript 一式と PR 自動化は削除した（`feat/redesign-p2-slim`）
- **P3（文書）**: README（英日）と `docs/ja/harness-engineering.md` を書き直した。mob・AIL・CLI 契約・metrics 関連の文書、テンプレート、例を削除した。`templates/repo-agents-pointer.md` では、引き継ぎを任意にした（`feat/redesign-p3-docs`）

## 2. いまの状態（State）

- 開発用 checkout `~/src/mantra` は、まだ `feat/p-judge-hook` のまま。これが現在のライブ設定なので、P4 まで触らない（push もしない）
- `~/.claude` は、まだ旧構成を指している。P1〜P3 のブランチは、どれもマージされていない
- 退役させたものは、タグ `pre-redesign` から戻せる

## 3. 決定事項（Decisions）

- 案 A′（縮小して作り直す）で進める
- ルールは合計 200 行・8KB まで。新モデルが出たら `/doctor prompt-audit` で 1 行ずつ見直す
- 引き継ぎは任意。`HANDOVER.md` か myak を使い、maw と Obsidian は必須にしない

## 4. 次にやること（Next）

1. P1〜P3 の PR を作り、次の順でマージする: 計画（#63）→ P1 → P2 → P3。P2 は P1 のマージ後に rebase してから入れる
2. P4（切り替え）: 計画 §7 の G5 の手順に従う
   1. 一時 HOME で、本番と戻し方をリハーサルする
   2. バックアップを取る
   3. `scripts/deploy.sh --init` でライブ用 clone を作る
   4. `settings.json`・`CLAUDE.md`・メモリを、項目ごとに承認を得て更新する
   5. 新しいセッションで確認する
3. P5（効果測定）: 切り替えの 4 週間後と 8 週間後に、計画 §8 の指標を測る

## 5. 罠・注意点（Pitfalls）

- **開発用 checkout とライブ用 clone は別物**: `~/.claude` が指すのは `~/.mantra/live` だけ。開発用 checkout でブランチを切り替えても、ライブ設定は変わらない。反映するのは `scripts/deploy.sh` を実行したとき
- **githooks は自動では有効にならない**: 新しい開発用 checkout では、一度 `git config core.hooksPath githooks` を実行する
- **`~/.codex` を消さない**: `~/.claude/skills` にある Claude 用スキル 6 つは `~/.codex/skills` へのシンボリックリンクで、`~/.codex` を消すと壊れる
- **`~/.mantra/generated` は P5 が終わるまで残す**: 戻すときに使う
- **タグ `pre-redesign` は、確認した時点ではローカルにしかなかった**（origin にはない）。README が参照しているので、切り替えの前に push する

## 6. 重要リンク・参照（References）

- `docs/MODERNIZATION_PLAN.md`: 計画（§7 が切り替え、§8 が測り方）
- `docs/redesign/rules-mapping.md`: 旧ルールとの対応表。戻したい振る舞いはここで探す
- PR #63: 計画
- PR #62: p-judge。クローズ済み
- タグ `pre-redesign`: 再設計前の状態
