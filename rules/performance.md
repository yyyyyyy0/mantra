# Performance Optimization

## Delegation Criteria

目的: コスパ最適化。Opus でなくても十分なタスクを適切に委譲し、トークンコストとコンテキスト消費を抑える。
一律禁止ではなく、タスク特性に応じて判断する。

### Default Model Mapping

| Role | Default | Override in `~/.claude/CLAUDE.md` |
|------|---------|-----------------------------------|
| コード生成（ボイラープレート・scaffold） | `mcp__codex__codex` | 例: `model: "sonnet"` (Codex 未利用環境) |
| サブエージェント（調査・ドキュメント・分析） | `model: "sonnet"` | 例: `model: "haiku"` (コスト重視) |
| 深い推論（アーキテクチャ決定・mob orchestration） | `model: "opus"` | — |

ユーザーは `~/.claude/CLAUDE.md` の「マルチエージェントのモデル選択」セクションでデフォルトを上書きできる。

### SHOULD delegate（委譲すべき）

- 大量のボイラープレート / scaffold / 定型コード生成 → Codex
- 多ファイル横断の網羅的調査（コンテキスト節約） → sonnet サブエージェント
- 独立した並列タスク（レビュー、ドキュメント生成等） → sonnet サブエージェント

### SHOULD NOT delegate（直接やるべき）

- 深い推論を伴う実装（アルゴリズム、複雑なリファクタ）
- 原因特定と修正が一体のバグ修正
- 数行の小さな修正（委譲のオーバーヘッド > 直接実行コスト）
- grep 1発で済む確認
- 調査結果を即座に判断に使う場合

## Context Window Management

Avoid last 20% of context window for:
- Large-scale refactoring
- Feature implementation spanning multiple files
- Debugging complex interactions

Lower context sensitivity tasks:
- Single-file edits
- Independent utility creation
- Documentation updates
- Simple bug fixes

## Ultrathink + Plan Mode

For complex tasks requiring deep reasoning:
1. Use `ultrathink` for enhanced thinking
2. Enable **Plan Mode** for structured approach
3. "Rev the engine" with multiple critique rounds
4. Use split role sub-agents for diverse analysis

## Build Troubleshooting

If build fails:
1. Use **build-error-resolver** agent
2. Analyze error messages
3. Fix incrementally
4. Verify after each fix
