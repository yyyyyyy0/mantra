# Performance Optimization

## Model Selection Strategy

**Codex** (default for all code generation):
- Implementation, boilerplate, scaffolding, test generation, code review assistance
- Delegate to the Codex tool when available (see global rules CLAUDE.md for the specific tool name)

**Sonnet 4.6** (for non-code sub-agents):
- Research, search, documentation generation, non-code analysis
- Specify `model: "sonnet"` when spawning via the Agent tool

**Opus 4.6** (only when heavy reasoning is required):
- Complex architectural decisions
- Orchestrator for plan-mob / flash-mob
- Research and analysis requiring deep reasoning
- Explicitly specify `model: "opus"` when spawning via the Agent tool

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
