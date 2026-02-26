# mantra

Claude Code の設定（agents・rules）を dotfiles として管理するリポジトリ。

新しいマシンやユーザーが `npm run setup` を実行するだけで、シムリンク経由で Claude Code に設定が反映される。

---

## Start here — 最初にやるべきこと / First steps

1. `npm ci` — 依存関係のインストール
2. `npm run validate` — 設定の検証
3. `npm run setup` — シムリンク作成
4. `npm run sync:codex` — Codex へ同期（任意）

↓ 詳細は以下のクイックスタートへ

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

# 4. Codex へ同期（任意、agents + rules）
npm run sync:codex
```

既存のシムリンク/ディレクトリを再作成する場合（実ディレクトリはバックアップ退避）:

```bash
npm run setup -- --force
```

---

## セットアップ検証 / Setup Verification

以下のコマンドでセットアップが正しく完了しているか検証できます：

```bash
# 依存関係の検証
npm ci
# 期待される出力: エラーなく完了

# agents/rules 定義の検証
npm run validate
# 期待される出力: ✓ All agents validated / ✓ All rules validated

# シムリンクの検証
ls -la ~/.claude/agents  # → mantra/agents へのシムリンク
ls -la ~/.claude/rules   # → mantra/rules へのシムリンク
```

**一般的なトラブルシューティング:**
- `npm ci` が失敗する場合: Node.js v20+ がインストールされているか確認
- `npm run validate` が失敗する場合: agents/ または rules/ ディレクトリの .md ファイルの frontmatter 構文を確認
- シムリンクが作成されない場合: `npm run setup -- --force` を試す（既存のディレクトリはバックアップされます）

---

## ディレクトリ構造

```
mantra/
├── agents/          # Claude Code エージェント定義（.md）
├── rules/           # Claude Code ルール定義（.md）
├── scripts/
│   ├── lib/                  # 共通ヘルパー（schema/path/meta/parser）
│   ├── setup.ts              # シムリンク作成スクリプト
│   ├── sync-agents-to-codex.ts  # agents を Codex へ同期
│   ├── sync-rules-to-codex.ts   # rules を Codex へ同期
│   ├── validate-agents.ts    # agents 検証
│   └── validate-rules.ts     # rules 検証
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
| `npm run setup -- --force` | 既存の実ディレクトリ/ファイルを `.bak-YYYYMMDDHHmmss` に退避して再作成 |
| `npm run sync:codex` | agents と rules を Codex へ同期（`~/.codex/skills/mantra/`, `~/.codex/skills/mantra-rules/`） |
| `npm run sync:codex:agents` | agents のみ Codex へ同期 |
| `npm run sync:codex:rules` | rules のみ Codex へ同期 |
| `npm run validate` | agents/rules の定義を検証 |
| `npm run validate:agents` | agents 定義のみ検証 |
| `npm run validate:rules` | rules 定義のみ検証 |

---

## CI / CD

このリポジトリでは GitHub Actions を使用して、以下のタイミングで自動検証を実行しています：

- **Pull Request の作成・更新時**
- **main ブランチへの push 時**

**検証内容:**
1. 依存関係のインストール (`npm ci`)
2. agents/rules 定義の検証 (`npm run validate`)
3. テストの実行 (`npm run test:run`)

**Node.js バージョン:**
- CI 環境: Node.js v20
- 推奨ローカル環境: Node.js v20+

ワークフロー定義: `.github/workflows/validate.yml`

---

## Mob Programming（実験的）/ Mob Programming (Experimental)

複雑なタスク向けのオプション機能として、**mob プログラミングオーケストレーション**用のエージェントとルールを含んでいます。

Optional feature for complex tasks: includes **mob programming orchestration** agents and rules.

### なぜモブプログラミングか？/ Why Mob Programming?

モブプログラミングは、以下の状況で意思決定の質と実装の安全性を向上させます：

Mob programming improves decision quality and implementation safety in these situations:

- **3+ 実装ステップ**を伴う変更 / Changes spanning **3+ implementation steps**
- **複数ファイル・レイヤー**に影響する変更 / Changes touching **multiple files/layers**
- **アーキテクチャ上のトレードオフ** / Architectural or API tradeoffs
- **高リスクドメイン**（認証・セキュリティ・課金・移行）/ **High-risk domains** (auth, security, billing, migrations)

### いつ使用すべきでないか / When NOT to Use

- タイプ修正、自明なフォーマット変更 / Typo fixes, trivial formatting
- 1ファイルの小変更 / Small one-file edits with obvious implementation
- 振る舞いの変更がないテストスナップショット / Test snapshots without behavior changes

### 含まれる mob 役割 / Included Mob Roles

| 役割 / Role | 説明 / Description |
|-------------|--------------------|
| `mob-navigator` | 意思決定フローの調整、専門家の順序決定 / Orchestrates decision flow, sequences specialists |
| `mob-critic` | 仮定への挑戦、リスク発見、失敗モードの特定 / Challenges assumptions, finds risks, identifies failure modes |
| `mob-scribe` | マルチエージェント出力の正規化・要約 / Normalizes multi-agent outputs into structured summary |

### 推奨モード / Recommended Modes

| モード / Mode | 使用タイミング / When to Use | 参加者例 / Typical Participants |
|---------------|----------------------------|-------------------------------|
| **flash-mob** | 実装前のクイックリスクスキャン / Preflight risk scanning | planner, architect, mob-critic, mob-navigator |
| **plan-mob** | 計画・受入条件の確定 / Lock plan and acceptance criteria | planner, architect, tdd-guide, mob-critic, mob-scribe |
| **review-mob** | マージ準備レビュー / Merge readiness review | code-reviewer, security-reviewer, mob-critic, mob-scribe |

### クイックスタート / Quickstart

```bash
# 5分で始める / Get started in 5 minutes
cat MOB_QUICKSTART.md

# 実行例を確認 / See examples
ls examples/mob-*-example.md

# 詳細ルール / Detailed rules
cat rules/mob-programming.md
```

### 関連ドキュメント / Related Docs

- `MOB_QUICKSTART.md` — 5分で始めるガイド / Get started in 5 minutes
- `rules/mob-programming.md` — 完全なプロトコルとアンチパターン / Complete protocol and anti-patterns
- `examples/` — flash-mob、plan-mob、review-mob の実行例 / Execution examples
- `docs/mob-role-boundaries.md` — 役割の境界と選択ガイド / Role boundaries and selection guide
- `templates/mob-*.md` — 二言語テンプレート（plan/review/decision-log）/ Bilingual templates

---

## ドキュメント / Documentation

| ドキュメント | 説明 |
|-------------|------|
| [Authoring Guide](./docs/authoring.md) | エージェント・ルールの作成ガイド |
| [Mob Programming](#mob-programming実験的-mob-programming-experimental) | 複雑タスク向けオーケストレーション |

---

## License

MIT (see LICENSE)
