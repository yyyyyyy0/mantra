---
name: deepen-request
description: Rewrite a request the way a top expert in its field would approach it, show the rewrite, then execute it. Use when the user runs /deepen-request or asks how an expert would tackle a request ("専門家ならどうやる?", "もっと深くやって").
argument-hint: "<request>"
---

# deepen-request

Raise the depth of a request before doing it: ask how a top expert in the field would approach it, rewrite the request accordingly, show the rewrite, then execute it.

Source: the "Depth" exercise in Felix Rieseberg, "How to be more ambitious: A tutorial for humans with models" (2026-10-13).

## Input

Request: $ARGUMENTS

If the request above is empty, use the user's most recent request in this conversation. If there is none, ask for it and stop.

## Use Cases
- Research, analysis, debugging, or implementation where the literal ask is shallower than the outcome the user needs
- Requests whose answer would otherwise rest on summaries or the model's own judgment instead of primary sources and checks

## Non-Goals
- Trivial edits (typos, one-line fixes): just do them
- Adding unrelated work (FM-CODE-CREEP): everything added must serve the user's stated outcome
- Dropping the user's explicit constraints (scope, tools, files, deadlines)

## Process

### 1. Name the expert
State the field and the expert in one line (e.g. "an SRE running a postmortem", "a statistician auditing a dataset").

### 2. Answer four questions
Answer each concretely for this request, in a few bullets:
1. **Beyond the ask**: What would that expert do beyond what was literally asked?
2. **Rawest source**: What is the most primary data or source they would go to? (raw logs, source code, the spec or RFC, the original dataset or paper; not secondary summaries)
3. **Methods and tools**: Which specific methods and tools would they use?
4. **External evidence**: What evidence outside the model shows the result is correct? Model self-assessment does not count. Prefer checks the model can run itself (tests, scripts, queries, builds, re-deriving from the primary source). If no such check exists, name the check a human must run.

### 3. Rewrite the request
Write a self-contained request that folds in the four answers:
- the outcome to deliver
- the sources to consult
- the methods to use
- the verification step and its pass condition
- every constraint from the original request, unchanged

### 4. Show the rewrite
Your first output for this skill is this block, as text, in the user's language. Call no tools before it: steps 1-3 happen in your head, and reading the sources belongs to the execution. Never skip this block or fold it into the final report; showing it first is the point of this skill.

````markdown
## Rewritten request
<the rewritten request>

### Expert lens: <field / expert>
1. Beyond the ask: ...
2. Rawest source: ...
3. Methods and tools: ...
4. External evidence: ...
````

### 5. Execute
Carry out the rewritten request in the same turn.
Stop and ask first only if the rewrite adds actions that are irreversible, outward-facing, or clearly larger in scope than the original; name the added part in one line.

### 6. Verify and report
Run the verification from question 4 (FM-PLAUSIBLE, FM-SKIP-CHECK). In the final report, list the evidence obtained and anything left unverified.
