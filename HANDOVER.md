Updated: 2026-10-15

---

## 1. 完了したこと（Done）

mantra の再設計（正本は `docs/MODERNIZATION_PLAN.md`）は、P0〜P4 まで終わりました。

- **P0 安全化**
  - バックアップを取った（`~/.claude/backups/mantra-redesign-20261015/`。切り替え直前の分は `p4/`）
  - `auto-merge.yml` を無効にした
  - p-judge を削除した
  - `cleanupPeriodDays` を 120 にした
  - PR #62 をクローズした
- **P1〜P3**: PR #65〜#67 で、ルール 4 ファイル、エージェント 4 体、guard、シェルのスクリプト、文書を作った。計画は #63。すべて main にマージした（`7bda3a4`）。途中で main に入った #64（deepen-request スキル）とは README で衝突したので、手で解消した。
- **P4 切り替え（2026-10-15）**
  - `~/.mantra/live` を clone して、`scripts/deploy.sh` を実行した。現在 `7bda3a4` を指している。
  - `~/.claude/rules` は `~/.mantra/live/rules` を指すようにした。
  - `~/.claude/agents` は実ディレクトリにした。中身は 4 体分のリンクと web-search-agent。
  - `settings.json` を次のように変えた。
    - PreToolUse の guard を `~/.mantra/live/hooks/guard.sh` に替えた。
    - tmux の注意喚起、`codex review`、HANDOVER の催促を削除した。
    - zed のフックと console.log のチェックは、`systemMessage` を返す形に直した。
    - `mcp__codex__*` の許可を外した。
  - `claude mcp remove codex` を実行した。
  - CLAUDE.md は myak の節だけにした。
  - メモリを更新した（`feedback_follow_claude_md_rules`、`feedback_model_delegation_strategy`、`project_mantra_redesign`）。
  - `~/.claude/skills/mantra*` のリンクと `~/.claude/templates/pr-automation` を削除した。
  - 開発用の `~/src/mantra` を main に切り替えた。
  - 新しい `claude -p` セッションで、次の 3 点を確認した。
    - ルールが 4 ファイル読み込まれていること
    - 新しい番兵行があり、旧ルールにしかない語がないこと
    - エージェントの一覧が正しいこと
  - guard が拒否を返すことは、このセッションで実地に確認した。
- タグ `pre-redesign` は origin に push 済み。

## 2. いまの状態（State）

- ライブ設定は `~/.mantra/live` から張られている。変更を反映するのは `scripts/deploy.sh` を実行したときだけ。
- 開発用 `~/src/mantra` は main にある。`core.hooksPath` は、まだ `.husky/_` のまま（下の Next 1 を参照）。
- すでに起動していたセッションは、再起動するまで旧ルールのまま動く。

## 3. 決定事項（Decisions）

- 案 A′（縮小して作り直す）。ルールは合計 200 行・8KB まで。
- 新しいモデルが出たら、`/doctor prompt-audit` を実行し、「消すとミスが起きるか」で 1 行ずつ見直す。
- 戻すときは、`p4/` のバックアップとタグ `pre-redesign` を使う。pre-P0 の settings.json は戻さない（p-judge が復活し、`cleanupPeriodDays` が消えるため）。

## 4. 次にやること（Next）

1. ユーザーが開発用 checkout で `cd ~/src/mantra && git config core.hooksPath githooks` を実行する。guard がこの操作を拒否するので、Claude には実行できない。
2. P5 の効果測定（計画 §8）を、2026-11-12（4 週後）と 2026-12-10（8 週後）に行う。
3. P5 が終わったら、`~/.mantra/generated` を trash に移す。
4. 任意の後片付け: 使い終えた worktree（`.maw-workspaces/modernization-plan`、`redesign-p1`〜`p3`、`harness_2026`）と、マージ済みのブランチを消す。
5. guard の誤検知を直す（下の Pitfalls を参照）。

## 5. 罠・注意点（Pitfalls）

- **guard の誤検知**: guard は、引用符の中の文字列や、サブシェルの閉じ括弧が付いた `git config` も遮断する。値なしの `git config core.hooksPath`（読み取り）も遮断するので、読み取りには `git config --get core.hooksPath` を使う。
- **`~/.codex` を消さない**: `~/.claude/skills` のうち 6 つは `~/.codex/skills` へのリンクになっている。
- **`~/.mantra/generated` は P5 が終わるまで残す**: 戻すときに使う。

## 6. 重要リンク・参照（References）

- `docs/MODERNIZATION_PLAN.md`（§7 切り替え、§8 測り方、§11 実施記録）
- `docs/redesign/rules-mapping.md`
- PR #63（計画）、#65〜#67（P1〜P3）、#62（クローズ済み）
- タグ `pre-redesign`
