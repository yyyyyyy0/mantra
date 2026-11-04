# pstack model configuration. One line per role. Delete a line to fall back to the skill default.
# `inherit-parent` or `auto` as a value: the role runs on the parent chat model (omit Task `model`). Alias entries in a panel list still count toward its fan-out.
# Managed by mantra (rules/pstack-models.md). Do not run setup-pstack; it would overwrite this file.
# budget: medium (high)
feature, refactoring: sonnet high
bug-fix: sonnet high
perf-issue: sonnet high
hillclimb: sonnet high
judgment and prose: opus high
hardest tasks: opus high
how explorer: sonnet high
how explainer: sonnet high
why investigators: sonnet medium
why synthesizer: sonnet high
reflect tooling: sonnet medium
reflect judgment, divergent, synthesizer: sonnet high
arena runners: opus high, sonnet high
arena cross-judge pool: sonnet high
swarm workers: sonnet medium
architect runners: opus high, sonnet high
interrogate reviewers: sonnet high, sonnet high
