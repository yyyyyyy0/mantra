# Mob Programming Orchestration (Experimental)

This rule defines how to run **structured multi-agent collaboration** for non-trivial tasks.

The goal is not to maximize conversation volume. The goal is to improve decision quality and implementation safety by using focused roles and a normalized summary.

---

## When to Use Mob Orchestration

Use mob orchestration when any of the following are true:
- The task spans **3+ implementation steps**
- The change touches multiple files, modules, or layers
- The task includes architectural or API tradeoffs
- The failure cost is high (security, auth, billing, migrations, data integrity)
- Root cause is unclear and requires hypothesis testing

### Usually Do Not Use It For
- Typo fixes
- Trivial formatting changes
- Small one-file edits with obvious implementation
- Straightforward test snapshots without behavior changes

---

## Core Roles

Use existing specialist agents for domain analysis and add mob-specific roles for coordination.

### Mob-specific roles
- `mob-navigator` — decomposes decision points, sequences participants, narrows next action
- `mob-critic` — challenges assumptions, identifies risks and failure modes
- `mob-scribe` — normalizes outputs into decision/risk/action summary

### Common specialist roles (examples)
- `planner`
- `architect`
- `tdd-guide`
- `code-reviewer`
- `security-reviewer`
- `e2e-runner`
- `build-error-resolver`

Do not duplicate roles unnecessarily in the same round.

---

## Mob Modes

### 1) flash-mob (preflight)
Use before implementation for fast risk scanning and ambiguity detection.

**Typical participants**
- `planner`
- `architect`
- `mob-critic`
- `mob-navigator` (orchestrating)

**Expected output**
- Main decision points
- Missing constraints
- Risky implementation paths to avoid
- Recommended next action

### 2) plan-mob (plan locking)
Use to establish implementation order, acceptance criteria, and verification strategy.

**Typical participants**
- `planner`
- `architect`
- `tdd-guide`
- `mob-critic`
- `mob-scribe` (for normalized summary)
- `mob-navigator` (optional if coordination is needed)

**Expected output**
- Execution plan
- Acceptance criteria
- Verification/test strategy
- Risks
- Open questions

### 3) review-mob (merge readiness)
Use after implementation to validate merge readiness and identify unresolved risk.

**Typical participants**
- `code-reviewer`
- `security-reviewer`
- `mob-critic`
- `mob-scribe`

**Expected output**
- Blockers
- Warnings
- Suggestions
- Residual risks
- Recommended next actions

---

## Discussion / Output Categories

When summarizing or structuring multi-agent outputs, use these categories:

- `OBSERVATION` — established facts (code, logs, test results, constraints)
- `PROPOSAL` — suggested change or plan
- `CHALLENGE` — critique, edge case, counterexample, risk
- `DECISION` — accepted / rejected / deferred conclusion
- `RISK` — explicit risk with severity and mitigation
- `ACTION` — next concrete task step

This keeps collaboration outputs actionable and comparable across tasks.

---

## Operating Rules

### 1. Keep the current round focused
Each round should address **one decision point** where possible.

### 2. Require challenge pressure
Include `mob-critic` (or equivalent challenge role) for risky or non-trivial decisions to avoid shallow consensus.

### 3. Prefer evidence-backed proposals
Proposals should reference code, logs, tests, requirements, or explicit assumptions.

### 4. Normalize before acting
Before starting implementation on a complex task, route the outputs through `mob-scribe` (or summarize in the same structure manually).

### 5. Avoid role duplication
Do not call multiple agents that provide effectively the same lens in the same round unless comparing outputs intentionally.

### 6. Escalate uncertainty
If key constraints are missing or unresolved tradeoffs remain, surface them explicitly instead of forcing consensus.

---

## Human Decision Gates

Mob orchestration improves analysis; it does not replace final judgment.

Recommended human gates:
1. **Plan approval** (after `plan-mob`)
2. **Implementation start approval** (for risky changes)
3. **Merge readiness approval** (after `review-mob`)

When uncertainty remains, prefer a smaller reversible step.

---

## Normalized Mob Summary Format (recommended)

Use `mob-scribe` and produce this exact structure:

1. **Objective**
2. **Constraints**
3. **Observations**
4. **Decisions**
   - Accepted
   - Rejected (with reason)
   - Deferred
5. **Risks**
6. **Action Plan (next 1-5 steps)**
7. **Open Questions**

---

## Practical Example Flows

### Feature implementation (moderate complexity)
1. `flash-mob`: planner + architect + mob-critic
2. `plan-mob`: planner + architect + tdd-guide + mob-scribe
3. Implement
4. `review-mob`: code-reviewer + mob-critic + mob-scribe

### Security-sensitive change
1. `flash-mob`: planner + architect + mob-critic
2. `plan-mob`: planner + architect + security-reviewer + tdd-guide + mob-scribe
3. Implement
4. `review-mob`: code-reviewer + security-reviewer + mob-critic + mob-scribe

---

## Anti-patterns to Avoid / 避けるべきアンチパターン

### 1. 決定目標なしのエージェント乱呼び / Calling Many Agents Without a Decision Target

**Symptom / 症状**: 複数のエージェントを一度に起動するが、何を決めるべきか明確でない。

**Problem / 問題**:
- 無関係な視点が混在し、ノイズが増える
- コスト増加につながらない対話が発生
- 最終的な決定ができないままセッションが終了する

**Fix / 修正**:
- mob-navigator を使用して決定ポイントを最初に分解する
- 各ラウンドで**一つの決定**に集中する
- 参加者を「今、どの視点が必要か」に基づいて選択する

---

### 2. 生トランスクリプトを最終成果物扱い / Treating Raw Transcripts as the Final Artifact

**Symptom / 症状**: エージェント対話のログをそのまま成果物として扱う。

**Problem / 問題**:
- 決定・リスク・アクションが明確でない
- 他のメンバーが理解・レビューできない
- 後から参照する際に情報が見つけにくい

**Fix / 修正**:
- mob-scribe を使用して正規化されたサマリーを作成する
- 決定/却下/先送りを明確に分類する
- リスクには優先度と緩和策を添付する

---

### 3. リスク作業での挑発役スキップ / Skipping Challenge Roles on Risky Work

**Symptom / 症状**: セキュリティ、認証、課金、データ整合性などの変更で mob-critic を含めない。

**Problem / 問題**:
- 浅いコンセンサスで危険な変更が進む
- リスクが検出されないまま本番にデプロイされる
- 回復不能な障害が発生する可能性

**Fix / 修正**:
- リスクの高い変更には必ず mob-critic（または同等の挑発役）を含める
- 失敗モード、エッジケース、カウンターエグザンプルを明示的に要求する
- 「なぜ失敗するか」を問う対話を促進する

---

### 4. 正規化プラン前の実装開始 / Starting Implementation Before a Normalized Plan Exists

**Symptom / 症状**: 複雑なタスクで、検討なしに直接コードを書き始める。

**Problem / 問題**:
- アーキテクチャ上のトレードオフが考慮されない
- 後からリファクタリングが必要になる（二重作業）
- 受入条件が不明で、完了判定ができない

**Fix / 修正**:
- plan-mob を使用して実行順序、受入条件、検証戦略を確定する
- 正規化されたサマリーを人間に承認してもらう
- 承認後に実装を開始する

---

### 5. 自明編集でのモブ使用 / Using Mob Orchestration for Trivial Edits

**Symptom / 症状**: タイプ修正、フォーマット変更、1ファイルの小変更でモブセッションを開く。

**Problem / 問題**:
- コストの割りに価値が生まれない
- オーバーヘッドがタスク時間を超える
- モブプログラミングが「重い」という印象を与える

**Fix / 修正**:
- 3ステップ未満、明らかな実装、単一ファイルの変更では直接修正する
- モブ使用の条件を確認する（「When to Use Mob Orchestration」）
- 不確実な場合は flash-mob を使用して迅速に判断する
