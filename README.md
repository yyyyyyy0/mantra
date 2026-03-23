# mantra

**Dotfiles manager for Claude Code — agents, rules, and harness config as code.**

Managing Claude Code's agents, rules, and hooks across machines is tedious and error-prone. mantra treats them as versionable dotfiles: `npm run onboarding` sets up symlinks and validates definitions, while `npm run onboarding:full` (Codex sync) or `npm run onboarding:claude` (Claude Code sync) extend the flow with optional syncing. Add your own agents and rules, share them across teams, and keep everything in CI.

---

Claude Code の設定（agents・rules）を dotfiles として管理するリポジトリ。

新しいマシンやユーザーが `npm run onboarding` を実行するだけで、シムリンク作成と検証まで完了する。
Codex 同期まで含める場合は `npm run onboarding:full`、Claude Code 同期まで含める場合は `npm run onboarding:claude` を使用する。

---

## Operating model / 運用モデル

このリポジトリは以下の3層で使い分けます。

| レイヤー / Layer | 定義 / Definition | 実行パス / Execution path |
|---|---|---|
| **Core** | 構成と検証の最小保証。`agents` / `rules` と symlink 作成。 | `npm run onboarding`（通常運用） |
| **Optional** | Core を増強する追加体験。Codex / Claude Code 同期や拡張実行。 | `npm run onboarding:full` / `npm run onboarding:claude`（任意） |
| **Experimental** | 複数視点・高リスク時の協調判断。常時有効ではない。 | `mob-*` 系（必要時のみ） |

### コア経路 / Core Path

```text
Quick onboarding (default): setup + validate
`npm run onboarding`
```

### 拡張経路 / Optional Path

```text
Codex sync 追加: setup + validate + sync
`npm run onboarding:full`

Claude Code sync 追加: setup + validate + claude sync
`npm run onboarding:claude`
```

### 実験的経路 / Experimental Path

```text
複数視点判断が必要な高リスク作業
`mob-navigator/mob-critic/mob-scribe` を条件付きで使用
```

### Specialist 利用判断（Single-agent優先） / Specialist Invocation

まず `single-agent` で進めます。条件を満たす場合のみ specialist を呼びます。

| 条件 / Condition | 推奨 / Recommended |
|---|---|
| 1ファイル / 明確な修正 / 小変更 | single-agent first |
| 既存 repo の段階的改善、欠陥削減、post-change hardening | `autonomous-improvement-loop` 検討 |
| 3+実装ステップ、または2+ファイル、または設計トレードオフがある | `planner` 検討 |
| 実装前レビューで High/Medium の未解決リスクが残る | `replan` で再計画（条件付き） |
| 実装後にコード品質の確認が必要 | `code-reviewer`（必要時） |
| 要件が曖昧、失敗コストが高い、複数利害がある | `mob` 系を検討（`mob-navigator`→`mob-critic`→`mob-scribe`） |

**`planner` と `replan` の使い分け**
- `planner`: 初回の実装計画を作る
- `replan`: レビュー結果を受けて、実装前に再計画する（`High + Medium > 0` の場合のみ）
- 同一ラウンドで同時起動しない（`planner` 出力を `replan` に引き継ぐ）

---

## Start here — 最初にやるべきこと / First steps

1. `npm ci` — 依存関係のインストール
2. `npm run onboarding` — セットアップ + 検証（core）
3. `npm run onboarding:full` — セットアップ + 検証 + Codex 同期（optional）
4. `npm run smoke:onboarding` — 最短導線のスモーク検証（任意）

↓ 詳細は以下のクイックスタートへ

---

## クイックスタート

```bash
# 1. クローン
git clone https://github.com/yyyyyyy0/mantra ~/.mantra
cd ~/.mantra

# 2. 依存インストール
npm ci

# 3. セットアップ+検証（最短導線）
npm run onboarding

# 4. Codex 同期まで実行する場合（任意）
npm run onboarding:full
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
# 期待される出力例:
# - ✓ <N> 件のエージェント定義が有効です
# - ✓ <N> 件のルール定義が有効です
# - ✓ drift validation passed (<checked> families checked / <seen> families seen)

# TypeScript 型検査
npm run typecheck
# 期待される出力: エラーなく完了

# Lint（warning を含めて失敗扱い）
npm run lint
# 期待される出力: エラーなく完了

# シムリンクの検証
ls -la ~/.claude/agents  # → ~/.mantra/generated/agents（user定義 or family 構成時は merge 経由）
ls -la ~/.claude/rules   # → mantra/rules へのシムリンク（family がなければ core 直リンク）
```

**一般的なトラブルシューティング:**
- `npm ci` が失敗する場合: Node.js v20+ がインストールされているか確認
- `npm run validate` が失敗する場合: agents/rules の .md / `*.family` 構成、出力名重複、`drift_guard` 設定を確認
- シムリンクが作成されない場合: `npm run setup -- --force` を試す（既存のディレクトリはバックアップされます）
- `npm run setup` 成功後の案内: Core next step は `npm run validate`、Optional next step は `npm run sync:codex`
- `error_code` 単位の詳細対処: [docs/troubleshooting.md](./docs/troubleshooting.md)

---

## ディレクトリ構造

```
mantra/
├── agents/          # Claude Code エージェント定義（legacy .md / *.family）
├── rules/           # Claude Code ルール定義（.md）
├── scripts/
│   ├── lib/                  # 共通ヘルパー（schema/path/meta/parser）
│   ├── setup.ts              # シムリンク作成スクリプト
│   ├── sync-agents-to-codex.ts   # agents を Codex へ同期
│   ├── sync-rules-to-codex.ts    # rules を Codex へ同期
│   ├── sync-agents-to-claude.ts  # agents を Claude Code へ同期
│   ├── sync-rules-to-claude.ts   # rules を Claude Code へ同期
│   ├── validate-agents.ts    # agents 検証
│   ├── validate-rules.ts     # rules 検証
│   └── validate-drift.ts     # family drift guard 検証
└── package.json
```

---

## エージェント一覧

`agents/` 配下のエージェントが `~/.claude/agents/` にシムリンクされる。

| エージェント | 用途 |
|---|---|
| `architect` | システム設計・アーキテクチャ判断 |
| `autonomous-improvement-loop` | 既存リポジトリの継続的改善。1 round = 1 issue で進み、safe boundary で停止・handoff する |
| `build-error-resolver` | ビルドエラー・型エラーの修正 |
| `code-reviewer` | コードレビュー（品質・セキュリティ・保守性） |
| `doc-updater` | ドキュメント・コードマップの更新 |
| `e2e-runner` | E2E テスト（Playwright） |
| `mob-critic` | Mob プログラミング：仮定への挑戦・リスク発見 |
| `mob-navigator` | Mob プログラミング：意思決定フローの調整 |
| `mob-scribe` | Mob プログラミング：出力の正規化・要約 |
| `planner` | 機能実装・リファクタリングの計画 |
| `replan` | レビュー反映の実装前再計画（条件付き） |
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
| `npm run onboarding` | セットアップ + 検証を一括実行（core） |
| `npm run onboarding:full` | セットアップ + 検証 + Codex 同期を一括実行（optional） |
| `npm run onboarding:claude` | セットアップ + 検証 + Claude Code 同期を一括実行（optional） |
| `npm run onboarding:json` | onboarding を JSON 出力モードで実行 |
| `npm run onboarding:full:json` | onboarding:full を JSON 出力モードで実行 |
| `npm run metrics:report -- --days 7` | 直近メトリクスをローカル集計（`--json` 対応） |
| `npm run setup -- --force` | 既存の実ディレクトリ/ファイルを `.bak-YYYYMMDDHHmmss` に退避して再作成 |
| `npm run sync:codex` | agents/rules/templates/examples を Codex へ同期 |
| `npm run sync:codex:json` | sync を JSON 出力モードで実行 |
| `npm run sync:codex:agents` | agents のみ Codex へ同期 |
| `npm run sync:codex:rules` | rules のみ Codex へ同期 |
| `npm run sync:codex:templates` | templates のみ Codex へ同期 |
| `npm run sync:codex:examples` | examples のみ Codex へ同期 |
| `npm run sync:codex:preview` | 書き込みなしで effective content を表示 |
| `npm run sync:codex:preview:json` | preview を JSON 出力モードで実行 |
| `npm run sync:claude` | agents/rules を Claude Code へ同期 |
| `npm run sync:claude:json` | sync を JSON 出力モードで実行 |
| `npm run sync:claude:agents` | agents のみ Claude Code へ同期 |
| `npm run sync:claude:rules` | rules のみ Claude Code へ同期 |
| `npm run sync:claude:preview` | 書き込みなしで effective content を表示 |
| `npm run validate` | agents/rules + family drift guard を検証 |
| `npm run validate:json` | validate を JSON 出力モードで実行 |
| `npm run validate:agents` | agents 定義のみ検証 |
| `npm run validate:rules` | rules 定義のみ検証 |
| `npm run validate:drift` | `drift_guard.enabled: true` の family drift を検証 |
| `npm run typecheck` | scripts/tests の TypeScript 型検査 |
| `npm run lint` | scripts/tests の ESLint チェック（warning も fail） |
| `npm run verify` | canonical verify（validate + typecheck + lint + unit/contract） |
| `npm run test:unit` | ユニット + 契約テストの実行 |
| `npm run test:coverage` | ユニット + 契約テストを coverage gate（80%）付きで実行 |
| `npm run smoke:onboarding` | onboarding フローのスモークテスト |

Claude sync (`sync:claude*`) は、`~/.claude/agents` / `~/.claude/rules` のシムリンクを壊さないよう、`~/.claude/skills/mantra*/SKILL.md` 配下に書き込みます。

## Harness Engineering / MVH

repo 横断の最小実行可能ハーネス（MVH: Minimum Viable Harness）の正本は次を参照します。

- [docs/harness-engineering.md](./docs/harness-engineering.md)
- [templates/repo-agents-pointer.md](./templates/repo-agents-pointer.md)
- [templates/repo-pre-push.example.sh](./templates/repo-pre-push.example.sh)
- [templates/repo-obsidian-ledger.md](./templates/repo-obsidian-ledger.md)

このセットで定義する内容:

- 1画面で読めるポインタ型 `AGENTS.md`
- repo ごとに 1 本へ寄せる canonical verify command
- unit / visual / acceptance の test ladder
- PreToolUse / PostToolUse / Stop と repo hook の役割分担
- `maw handover/takeover` と Obsidian ledger を使う継続契約

### 導線ガイド / Execution guidance

- 単純修正や明確な 1 ファイル修正は `single-agent` で完了する
- 既存 repo の段階的改善や hardening は `autonomous-improvement-loop` を優先する
- 複数判断が必要な作業は `planner` で初回計画を作る
- 実装前レビューで高/中リスクが未解決なら `replan` で再計画する
- 変更後のコードレビューは `code-reviewer`、高リスク判断が必要な時のみ `mob`

### `autonomous-improvement-loop` の使いどころ / When to use

- 呼び出し名はこれまでどおり `autonomous-improvement-loop` を使います
- source of truth は [`agents/autonomous-improvement-loop.family`](./agents/autonomous-improvement-loop.family/) です
- 既存 repo の段階的改善に使い、新規機能の greenfield 設計には使いません
- 固定 round cap はなく、**1 round = 1 selected issue** で継続します
- 新しい user steer が来たら current atomic step の後、safe boundary で止まります
- 毎 round で `[AIL][rNN]` summary block を出し、停止時は final handoff summary を残します
- worktree が dirty か baseline が不安定な場合は `QA-only mode` に切り替えます

---

## User-Defined Content（追加定義の受け入れ）

外部（`mantra/` 配下外）のユーザー定義 `agents/rules/templates/examples` を、core 定義と一緒に扱えます。  
この機能は **Stable** として運用します。

主設定（推奨）:
- `~/.config/mantra/sources.json`
  - `roots`, `agentsDirs`, `rulesDirs`, `templatesDirs`, `examplesDirs`

互換 fallback（既存）:
- `MANTRA_USER_CONTENT_ROOTS`  
  - 例: `/Users/nil/my-mantra-extra,/Users/nil/team-mantra`
  - 各ルート配下の `agents/`, `rules/`, `templates/`, `examples/` を読み込む
- `MANTRA_USER_AGENTS_DIRS`, `MANTRA_USER_RULES_DIRS`, `MANTRA_USER_TEMPLATES_DIRS`, `MANTRA_USER_EXAMPLES_DIRS`
  - 種別ごとの直接指定（カンマ区切り）

補足:
- 同名ファイルは「後から読まれたソース」が優先されます
- 衝突ポリシーは filename 衝突のみで、`W_SOURCE_CONFLICT_FILENAME` warning を出してユーザー定義を優先します
- family は `*.family/{family.yml,base.md,overlays/*}` 形式で定義します
- `family.yml.targets` は overlay 名（例: `codex`）を指定し、`overlays/<name>.md` を解決します
- `family.yml.drift_guard`（opt-in）で drift 契約を強制できます（`enabled`, `max_overlay_ratio`）
- lock marker 構文は `<!-- mantra-lock:<id>:start -->` / `<!-- mantra-lock:<id>:end -->`
- 継続的な運用契約や構造化出力は `base.md` に置き、overlay は target ごとの差分だけに薄く保ちます
- family の合成結果は `npm run sync:codex:preview` / `npm run sync:codex:preview:json` で確認できます
- 同一 source で legacy と family が同名出力になる場合は family を優先し、warning を出します
- agent/rule の name 重複（legacy + family）は warning ではなく、`validate:agents|validate:rules` で `E_INPUT_INVALID` として失敗します
- drift_guard 違反は `validate:drift` で `E_FAMILY_DRIFT` として失敗します
- ユーザー定義または family 構成がある種別では、`setup` は `~/.mantra/generated/*` にマージして `~/.claude/agents|rules` へリンクします

ロードマップ上の位置づけ:
- Phase 2/3（運用性・一貫性）で作った基盤を使って、Phase 4（ユーザー価値）を回収する代表施策です。

---

## CI / CD

このリポジトリでは GitHub Actions を使用して、以下のタイミングで自動検証を実行しています：

- **Pull Request の作成・更新時**
- **main ブランチへの push 時**

**検証内容:**
1. 依存関係のインストール (`npm ci`)
2. agents/rules 定義の検証 (`npm run validate`)
3. TypeScript 型検査 (`npm run typecheck`)
4. ESLint (`npm run lint`)
5. ユニット/契約テスト + coverage gate の実行 (`npm run test:coverage`)
6. onboarding スモークテストの実行 (`npm run smoke:onboarding`)

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
| **plan-mob** | 計画・受入条件の確定 / Lock plan and acceptance criteria | planner, architect, tdd-guide, mob-critic, mob-scribe (`replan` is a follow-up step, not same-round parallel) |
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
| [CLI Contract](./docs/cli-contract.md) | `--json` 出力・error_code・終了コードの契約 |
| [Ops Metrics](./docs/ops-metrics.md) | KPI 定義、計測イベント、`metrics:report` の集計粒度 |
| [Troubleshooting](./docs/troubleshooting.md) | `error_code` ごとの復旧手順 |
| [Mob Programming](#mob-programming実験的-mob-programming-experimental) | 複雑タスク向けオーケストレーション |

---

## License

MIT (see LICENSE)
