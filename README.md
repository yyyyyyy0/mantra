# mantra

Claude Code の設定（agents・rules）を dotfiles として管理するリポジトリ。

新しいマシンやユーザーが `npm run setup` を実行するだけで、シムリンク経由で Claude Code に設定が反映される。

---

## クイックスタート

```bash
# 1. クローン
git clone https://github.com/yyyyyyy0/mantra ~/.mantra
cd ~/.mantra

# 2. 依存インストール
npm install

# 3. シムリンク作成（~/.claude/agents, ~/.claude/rules）
npm run setup

# 4. Codex へエージェントを同期（任意）
npm run sync:codex
```

既存のシムリンク/ディレクトリを上書きする場合:

```bash
npm run setup -- --force
```

---

## セットアップ確認

```bash
ls -la ~/.claude/agents  # → /path/to/mantra/agents
ls -la ~/.claude/rules   # → /path/to/mantra/rules
```

---

## ディレクトリ構造

```
mantra/
├── agents/          # Claude Code エージェント定義（.md）
├── rules/           # Claude Code ルール定義（.md）
├── scripts/
│   ├── setup.ts              # シムリンク作成スクリプト
│   └── sync-agents-to-codex.ts  # Codex への同期スクリプト
└── package.json
```

---

## エージェント一覧

`agents/` 配下のエージェントが `~/.claude/agents/` にシムリンクされる。

| エージェント | 用途 |
|---|---|
| `architect` | システム設計・アーキテクチャ判断 |
| `build-error-resolver` | ビルドエラー・型エラーの修正 |
| `code-reviewer` | コードレビュー（品質・セキュリティ・保守性） |
| `doc-updater` | ドキュメント・コードマップの更新 |
| `e2e-runner` | E2E テスト（Playwright） |
| `mob-critic` | Mob プログラミング：仮定への挑戦・リスク発見 |
| `mob-navigator` | Mob プログラミング：意思決定フローの調整 |
| `mob-scribe` | Mob プログラミング：出力の正規化・要約 |
| `planner` | 機能実装・リファクタリングの計画 |
| `refactor-cleaner` | 不要コードの削除・整理 |
| `security-reviewer` | セキュリティ脆弱性の検出・修正 |
| `tdd-guide` | テスト駆動開発（テストファースト） |

---

## ルール一覧

`rules/` 配下のルールが `~/.claude/rules/` にシムリンクされ、すべてのプロジェクトに自動適用される。

| ルール | 内容 |
|---|---|
| `agents.md` | エージェントオーケストレーション・並列実行 |
| `coding-style.md` | イミュータビリティ・ファイル構成・エラー処理 |
| `git-workflow.md` | コミットメッセージ・PR ワークフロー |
| `hooks.md` | Claude Code hooks の設定と利用 |
| `patterns.md` | API レスポンス形式・カスタムフック・リポジトリパターン |
| `performance.md` | モデル選択・コンテキスト管理・Ultrathink |
| `security.md` | セキュリティチェックリスト・シークレット管理 |
| `testing.md` | テストカバレッジ要件・TDD ワークフロー |

---

## スクリプト

| コマンド | 説明 |
|---|---|
| `npm run setup` | シムリンクを作成（初回セットアップ） |
| `npm run setup -- --force` | 既存ファイルを上書きしてシムリンクを再作成 |
| `npm run sync:codex` | agents を `~/.codex/skills/mantra/` へ同期 |

---

## Mob Programming (Experimental)

This pack includes optional **mob programming orchestration** agents and rules for non-trivial tasks.

Use it when a change involves multiple steps, architectural tradeoffs, or high-risk domains (auth, security, migrations, billing).

### Included mob roles
- `mob-navigator` — coordinates decision flow and next steps
- `mob-critic` — challenges assumptions and surfaces risks
- `mob-scribe` — normalizes multi-agent outputs into decision/risk/action summaries

### Suggested modes
- **flash-mob**: quick preflight risk scan
- **plan-mob**: lock plan + acceptance criteria + verification strategy
- **review-mob**: merge-readiness review with blocker/warning summary

See `rules/mob-programming.md` for the operating rules and summary format.

---

## License

MIT
