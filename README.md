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
| `mob-programming.md` | Mob プログラミング：マルチエージェント協調・意思決定プロトコル |
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

## Mob Programming（実験的）

複雑なタスク向けのオプション機能として、**mob プログラミングオーケストレーション**用のエージェントとルールを含んでいます。

複数ステップを伴う変更、アーキテクチャ上のトレードオフ、高リスクドメイン（認証・セキュリティ・マイグレーション・請求など）での使用に適しています。

### 含まれる mob 役割
- `mob-navigator` — 意思決定フローと次のステップを調整
- `mob-critic` — 仮定に挑戦し、リスクを表面化
- `mob-scribe` — マルチエージェントの出力を意思決定/リスク/アクションの要約に正規化

### 推奨モード
- **flash-mob**: クイック事前リスクスキャン
- **plan-mob**: 計画・受入条件・検証戦略の確定
- **review-mob**: ブロッカー/警告要約付きマージ準備レビュー

詳細な運用ルールとサマリー形式は `rules/mob-programming.md` を参照してください。

---

## License

MIT
