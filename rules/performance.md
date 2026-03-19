# Performance Optimization

## Model Selection Strategy

**Codex**（コード生成全般のデフォルト）:
- 実装・ボイラープレート・scaffold・テスト生成・コードレビュー補助
- `mcp__codex__codex` ツールを使って委譲

**Sonnet 4.6**（コード以外のサブエージェント）:
- 調査・検索・ドキュメント生成・非コード分析
- Agent tool で spawn する際は `model: "sonnet"` を指定

**Opus 4.6**（重い思考が必要な場合のみ）:
- 複雑なアーキテクチャ決定
- plan-mob / flash-mob のオーケストレーター
- 深い推論が必要な調査・分析
- Agent tool で spawn する際は `model: "opus"` を明示指定

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
