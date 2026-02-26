# Authoring Guide for mantra

このガイドは、mantra リポジトリに新しいエージェントやルールを追加する際のベストプラクティスをまとめたものです。

---

## Agent の作成

### 必須 Frontmatter フィールド

すべてのエージェント定義 (`agents/*.md`) には、以下の YAML frontmatter が必須です：

```yaml
---
name: agent-name
description: 簡潔な説明（1-2文）
tools: ["Read", "Write", "Edit"] # 省略時は []
model: opus # 省略可能: opus | sonnet | haiku
---
```

### フィールドの説明

| フィールド | 必須 | 説明 |
|-----------|------|------|
| `name` | ✅ | エージェント名。ファイル名と一致させる（例: `planner.md` → `name: planner`）。英数字とハイフン/アンダースコアのみ |
| `description` | ✅ | エージェントの目的と使用タイミングを簡潔に説明 |
| `tools` | ❌ | エージェントが使用可能なツール配列。デフォルトは空配列 |
| `model` | ❌ | 使用する Claude モデル。省略時はシステムデフォルト |

### 命名規則

- **小文字ケバブケース:** `my-agent`, `security-reviewer`
- **役割ベースの名前:** `planner`, `reviewer`, `tester`
- **避けるべき名前:** `-test` サフィックス（テストファイルと混同）、過度に一般的な名前（`helper`, `util`）

### ツール権限最小化ルール

エージェントには必要最小限のツールのみを割り当ててください。

#### ツールカテゴリと推奨設定

| カテゴリ | ツール例 | 推奨用途 |
|---------|---------|---------|
| **読み取り専用** | `Read`, `Glob`, `Grep` | リサーチ、分析、コードレビュー |
| **編集** | `Edit`, `Write` | 実装、リファクタリング |
| **実行** | `Bash` | ビルド、テスト実行、git 操作 |
| **危険なツール** | `Bash` (特定コマンド) | 特別な注意が必要 |

#### 危険なツール組み合わせの回避

以下の組み合わせは避けてください：

- ❌ `Write` + `Bash` (強制実行可能) → リスク評価後にのみ使用
- ❌ 全ツール + `model: opus` → コスト高、不要なモデル選択

#### ツール選定のチェックリスト

- [ ] このエージェントの目的に本当に必要なツールだけを含めているか？
- [ ] 読み取りだけで済む場合は、読み取り専用ツールだけを使用しているか？
- [ ] `Bash` を使用している場合、危険なコマンドを直接実行しないよう注意しているか？

#### ツール権限の具体例

**読み取り専用エージェント（コードレビュー・分析）**
```yaml
---
name: code-reviewer
description: コードレビュー専門エージェント
tools: ["Read", "Grep", "Glob"]
---
```

**編集権限付きエージェント（リファクタリング）**
```yaml
---
name: refactor-cleaner
description: 不要コードの削除・整理
tools: ["Read", "Write", "Edit", "Grep", "Glob", "Bash"]
---
```

**フル権限エージェント（慎重に使用）**
```yaml
---
name: build-error-resolver
description: ビルドエラー・型エラーの修正
tools: ["Read", "Write", "Edit", "Grep", "Glob", "Bash"]
model: haiku  # 高頻度呼び出し向けに軽量モデルを選択
---
```

### 出力フォーマット要件

エージェントの説明には以下のセクションを含めてください：

1. **使用タイミング / When to Use**
   - 具体的なシナリオとトリガー条件

2. **主な責務 / Primary Responsibilities**
   - このエージェントが担当する作業

3. **非目標 / Non-goals**
   - このエージェントが意図的に担当しない作業

4. **ワークフロー / Workflows**
   - 段階的なプロセス説明

5. **品質基準 / Quality Bar**
   - 完了の判断基準

### 良い説明トリガーの例

```
ユーザーが以下を求めたときにこのエージェントを使用します：
- "この機能の実装計画を立てて"
- "アーキテクチャのトレードオフを評価して"
- "コードレビューをして"
```

### アンチパターン

| ❌ 避けるべき | ✅ 代わりに |
|-------------|-----------|
| 範囲が広すぎる「何でも屋」エージェント | 単一責務の専門家エージェント |
| 他のエージェントと役割が重複 | 明確な境界を持つ役割定義 |
| 過剰なツール権限 | 最小限のツールセット |
| 曖昧な使用条件 | 具体的なトリガー条件 |

---

## Rule の作成

### ファイル形式

ルール定義 (`rules/*.md`) には YAML frontmatter は**使用しません**。代わりに：

1. ファイル名がルール名になる（例: `coding-style.md` → `coding-style`）
2. 最初の H1 見出しが説明になる（例: `# Coding Style`）

### 命名規則

- **小文字ケバブケース:** `coding-style`, `mob-programming`
- **トピックベース:** `testing`, `security`, `performance`
- **汎用的すぎる名前は避ける:** `config`, `settings`（何の設定か不明）

### コンテンツ構造

```markdown
# ルールタイトル

## 簡潔な説明

このルールの目的と適用範囲を1-2文で説明。

## セクション1: 具体的なガイドライン

### 良い例 / CORRECT

\```typescript
// 実装例
\```

### 悪い例 / WRONG

\```typescript
// 避けるべき例
\```

## チェックリスト

Before marking work complete:
- [ ] チェック項目1
- [ ] チェック項目2
```

### 推奨パターン

- **命令言語:** `ALWAYS`, `NEVER`, `MUST` で重要な要件を強調
- **Before/After 例:** 正しいアプローチと間違ったアプローチを並べて示す
- **チェックリスト:** 検証可能な基準を箇条書き
- **エージェント参照:** 関連する専門家エージェントをリンク

---

## 検証と同期

### ユーザー定義ディレクトリの追加

コア定義とは別に、追加の `agents/rules/templates/examples` を読み込めます。

- `MANTRA_USER_CONTENT_ROOTS=/path/a,/path/b`
  - それぞれのルート配下の `agents/`, `rules/`, `templates/`, `examples/` を対象化
- または種別単位で直接指定:
  - `MANTRA_USER_AGENTS_DIRS`
  - `MANTRA_USER_RULES_DIRS`
  - `MANTRA_USER_TEMPLATES_DIRS`
  - `MANTRA_USER_EXAMPLES_DIRS`

`agents/rules` は name 重複時にエラーになります（運用一貫性のため）。

### 作成後の検証

```bash
# Agent の検証
npm run validate:agents

# Rule の検証
npm run validate:rules

# 両方の検証
npm run validate

# JSON 契約で検証（機械可読）
npm run validate:agents -- --json
npm run validate:rules -- --json
```

### Codex への同期

```bash
# Agent を Codex スキルとして同期
npm run sync:codex:agents

# Rule を Codex スキルとして同期
npm run sync:codex:rules

# 両方同期
npm run sync:codex

# JSON 契約で同期
npm run sync:codex:agents -- --json
npm run sync:codex:rules -- --json
```

### スモークテスト

onboarding 導線の回帰検知として、以下を実行してください：

```bash
npm run smoke:onboarding
```

### 動作テスト手順

新しいエージェントを作成した後、以下の手順で動作テストを実施してください：

```bash
# 1. スキーマ検証
npm run validate:agents

# 2. シムリンクの確認
ls -la ~/.claude/agents/your-agent-name

# 3. Claude Code でテスト
# Claude Code セッション内で以下を実行：
# - エージェントを明示的に呼び出す
# - 指定されたツール権限内で動作するか確認
# - 期待される出力フォーマットを確認

# 4. エラーログの確認
# ~/.claude/logs/ で詳細なログを確認可能
```

**テストチェックリスト:**
- [ ] フロントマターが正しく解析される
- [ ] ファイル名と `name` が一致している
- [ ] 指定されたツールのみが使用される
- [ ] `model` 指定がある場合は正しいモデルで動作する
- [ ] エージェントの説明に従った出力が得られる

---

## プルリクエストのチェックリスト

新しい agent/rule を追加する PR では、以下を確認してください：

- [ ] `npm run validate` がパスする
- [ ] `npm run test:unit` がパスする
- [ ] `npm run smoke:onboarding` がパスする
- [ ] ファイル名が命名規則に従っている
- [ ] 必要な frontmatter フィールドが含まれている（agent の場合）
- [ ] 使用タイミングと非目標が明確に記述されている
- [ ] ツール権限が最小限に抑えられている
- [ ] 既存の agent/rule と重複していない

---

## 関連ファイル

- **検証スクリプト:** `scripts/validate-agents.ts`, `scripts/validate-rules.ts`
- **同期スクリプト:** `scripts/sync-agents-to-codex.ts`, `scripts/sync-rules-to-codex.ts`
- **CLI 契約:** `docs/cli-contract.md`
- **メトリクス仕様:** `docs/ops-metrics.md`
- **トラブルシュート:** `docs/troubleshooting.md`
- **スキーマ定義:** `scripts/lib/agent-schema.ts`, `scripts/lib/rule-schema.ts`
