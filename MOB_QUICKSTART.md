# Mob Programming Quickstart / モブプログラミングクイックスタート

5分でモブプログラミングを始めるガイド。

Get started with mob programming in 5 minutes.

---

## Step 1: モードを選択 / Choose a Mode

あなたのタスクに適したモードを選択してください。

Choose the mode that fits your task.

| Mode / モード | Use Case / 使用ケース | 参加者例 |
|---------------|----------------------|----------|
| **flash-mob** | 実装前のクイックリスクスキャン | planner, architect, mob-critic, mob-navigator |
| **plan-mob** | 計画・受入条件の確定 | planner, architect, tdd-guide, mob-critic, mob-scribe |
| **review-mob** | マージ準備レビュー | code-reviewer, security-reviewer, mob-critic, mob-scribe |

**Decision Guide / 決定ガイド**:
- 実装前にリスクを知りたい？ → **flash-mob**
- 実装計画を作成したい？ → **plan-mob**
- 実装後のレビュー？ → **review-mob**

---

## Step 2: 最初のモブセッションを実行 / Run Your First Mob Session

### flash-mob の例 / flash-mob Example

```
あなた: 認証システムのリファクタリングを検討している。リスクを知りたい。

Claude: mob-navigator エージェントを起動して、意思決定フローを調整します...
```

### plan-mob の例 / plan-mob Example

```
あなた: E2E テスト基盤を追加したい。実装計画を作成してほしい。

Claude: planner + architect + tdd-guide + mob-critic + mob-scribe を起動します...
```

### review-mob の例 / review-mob Example

```
あなた: セキュリティ変更の PR をレビューしてほしい。

Claude: code-reviewer + security-reviewer + mob-critic + mob-scribe を起動します...
```

---

## Step 3: 出力を確認 / Review Output

各モブセッションは以下を含む正規化されたサマリーを生成します：

Each mob session produces a normalized summary including:

- **Objective / 目的** — 何を決定したか / What was decided
- **Observations / 観察** — 確立された事実 / Established facts
- **Decisions / 決定** — 採択/却下/先送り / Accepted/Rejected/Deferred
- **Risks / リスク** — 優先度付きリスク付き / Prioritized risks with mitigations
- **Action Plan / アクション計画** — 次の1-5ステップ / Next 1-5 steps

---

## Step 4: 人間による承認 / Human Approval

**重要**: モブセッションの出力は、人間による承認ゲートを通じてから実装を開始してください。

**IMPORTANT**: Get human approval before starting implementation based on mob session output.

推奨承認ゲート / Recommended approval gates:
1. **Plan approval** — plan-mob の後
2. **Implementation start approval** — リスクの高い変更の場合
3. **Merge readiness approval** — review-mob の後

---

## Step 5: 詳細ドキュメントへ / Explore Detailed Docs

- **完全なプロトコル**: `rules/mob-programming.md`
- **エージェント詳細**: `agents/mob-*.md`
- **実行例**: `examples/mob-*-example.md`
- **テンプレート**: `templates/mob-*.md`
- **役割境界**: `docs/mob-role-boundaries.md`

---

## クイックリファレンス / Quick Reference

### mob-navigator / モブナビゲーター
意思決定フローを調整し、専門家を呼び出す順序を決定します。

Orchestrates decision flow and sequences which specialists to consult.

### mob-critic / モブクリティック
仮定に挑戦し、リスクを表面化します。

Challenges assumptions and surfaces risks.

### mob-scribe / モブスクライブ
マルチエージェントの出力を正規化されたサマリーにまとめます。

Normalizes multi-agent outputs into a structured summary.

---

## 次のステップ / Next Steps

1. 実行例を確認する: `examples/mob-flash-example.md`
2. テンプレートを使う: `templates/mob-plan.md`
3. 詳細ルールを読む: `rules/mob-programming.md`

Happy mobbing! / ハッピーモッビング！
