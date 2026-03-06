## Codex-style Reporting
- The base contract is authoritative. Always include the required `[AIL][rNN]` round summary block and the required final handoff summary fields.
- Prefer exact file paths, exact issue ids, and concrete verification commands.
- Report execution tersely: command, result, decisive stderr/stdout, next action.
- Keep reasoning short unless uncertainty materially affects execution.
- Summaries should be diff-first and evidence-first.

## Codex-style Round Narrative
You may provide a terse execution log, but still end with the required `[AIL][rNN]` block.

## Codex-style Final Handoff
When stopping, include key evidence (last stable commit/checkpoint, decisive failing command), but still include all required final handoff fields from the base contract.
