# Mob Role Boundaries / モブ役割の境界

モブプログラミングでの役割重複を避けるためのガイド。

Guide to avoid role duplication in mob programming.

---

## mob-navigator vs planner / モブナビゲーター vs プランナー

| Aspect / 側面 | mob-navigator | planner |
|---------------|---------------|---------|
| **Focus / 焦点** | 意思決定フローの調整 | 実装計画の作成 |
| **When to Use / 使用タイミング** | 複数の決定ポイントがある | 計画文書が必要 |
| **Output / 出力** | 次のアクション、参加者順序 | 詳細実装計画 |
| **Scope / スコープ** | オーケストレーションのみ | 計画の内容 |

### 良い例 / Good Example

```
[正しい / CORRECT]
1. mob-navigator: 決定ポイントを分解し、planner を呼び出す
2. planner: 実装計画を作成する
```

### 悪い例 / Bad Example

```
[間違い / WRONG]
1. mob-navigator と planner を同時に起動（役割重複）
```

---

## planner vs replan / プランナー vs リプラン

| Aspect / 側面 | planner | replan |
|---------------|---------|--------|
| **Focus / 焦点** | 初回の実装計画作成 | レビュー反映の再計画（実装前） |
| **When to Use / 使用タイミング** | 3+ steps / 2+ files / 非自明な選択 | 実装前レビューで High/Medium が未解決 |
| **Output / 出力** | 初版実装計画 | V1→V2→(条件付きV3) の再計画 + stop decision |
| **Scope / スコープ** | 計画の骨子作成 | 計画品質の再評価・再構成（plan-only） |

### 良い例 / Good Example

```
[正しい / CORRECT]
1. planner: 初回計画を作成
2. pre-implementation review: 未解決 High/Medium を確認
3. replan: レビュー結果を反映して再計画
```

### 悪い例 / Bad Example

```
[間違い / WRONG]
1. planner と replan を同一ラウンドで同時起動
2. trivial な 1 ファイル修正で replan を常時起動
```

---

## mob-critic vs code-reviewer / モブクリティック vs コードレビュワー

| Aspect / 側面 | mob-critic | code-reviewer |
|---------------|------------|---------------|
| **Focus / 焦点** | 仮定への挑戦、リスク発見 | コード品質、保守性 |
| **When to Use / 使用タイミング** | 決定前のリスク特定 | 実装後のコードレビュー |
| **Output / 出力** | CHALLENGE、RISK | 品質問題、改善提案 |
| **Timing / タイミング** | 実装前 | 実装後 |

### 良い例 / Good Example

```
[正しい / CORRECT]
flash-mob:
- architect: 提案をする
- mob-critic: 提案のリスクを指摘する

review-mob:
- code-reviewer: コード品質をレビュー
- mob-critic: 残余リスクを特定
```

### 悪い例 / Bad Example

```
[間違い / WRONG]
- コードレビューで mob-critic だけで実施（コード品質の視点が欠落）
```

---

## mob-scribe vs ユーザー / モブスクライブ vs ユーザー

| Aspect / 側面 | mob-scribe | ユーザー / Human |
|---------------|------------|------------------|
| **Role / 役割** | 出力の正規化・要約 | 最終決定、承認 |
| **Cannot / できない** | 決定を下す | すべての出力を整形する |
| **Can / できる** | 構造化されたサマリー | 人間の判断を加える |

### 良い例 / Good Example

```
[正しい / CORRECT]
1. mob-scribe: 構造化されたサマリーを作成
2. ユーザー: サマリーを確認し、承認
```

### 悪い例 / Bad Example

```
[間違い / WRONG]
- mob-scribe に決定を委ねる（最終判断は人間）
```

---

## Task Size and Role Selection / タスクサイズと役割選択

### Decision flow (single-agent first)

- **Default**: single-agent path is preferred.
- **Escalate to planner** only when threshold is met (3+ steps / 2+ files / non-obvious tradeoff).
- **Escalate to replan** only when pre-implementation review leaves unresolved High/Medium risks.
- **Escalate to mob** only when planner/replan still leaves unresolved ambiguity and cost/benefit is positive.

共通語彙:
- **Core**: 単一実行で完結する既定のデフォルト導線
- **Optional**: 専門家追加を使って品質を強化する追加導線
- **Experimental**: 高い不確実性・高リスク時のみ試す協調導線

### Small Tasks / 小さなタスク（1-2ファイル、明らかな実装）
- **Do / する**: 直接実装
- **Don't / しない**: モブプログラミング

例 / Example:
- タイプ修正
- 1関数のリファクタリング

### Medium Tasks / 中程度のタスク（3-5ファイル、複数の選択肢）
- **Do / する**: 必要時のみ flash-mob または plan-mob（default は single-agent / planner）
- **Participants / 参加者**: 必要最低限の専門家

例 / Example:
- 新しい API エンドポイント追加
- 1モジュールのリファクタリング

### Large Tasks / 大きなタスク（6+ファイル、アーキテクチャ上のトレードオフ）
- **Do / する**: 高リスク/高不確実性なら flash-mob → plan-mob → 実装 → review-mob
- **Participants / 参加者**: 必要な全専門家

例 / Example:
- 認証システムのリファクタリング
- 新しいサブシステムの追加

### High-Risk Tasks / 高リスクタスク（セキュリティ、請求、データ整合性）
- **Do / する**: 常に mob-critic を含める
- **Additional / 追加**: ドメイン専門家（security-reviewer など）

### 終了基準 / Exit condition（実験的導線）

mob が期待しないコスト上昇を招くと判断した場合は即中止して single-agent 実行へ戻す。
- `flash-mob` で未解決決定点が 0〜1 件に収まる
- 2ラウンド目以降も決定点が増える見込み
- 追加の意思決定時間が単独実行の 2 倍を超える見込み

---

## Avoiding Duplication / 重複の回避

### Rule 1: One Lens Per Round / ラウンドあたり一つの視点

同じ視点を持つエージェントを同時に呼ばないでください。

Do not call agents with the same perspective simultaneously.

```
[間違い / WRONG]
- planner と architect を同一決定点へ同時並列で投げる（責務分離なし）

[正しい / CORRECT]
- mob-navigator が調整し、planner → architect を順次起動して責務を分離する
```

### Rule 2: Include Challenger for Risk / リスクには挑発役を含める

リスクの高い変更には、必ず mob-critic（または同等）を含めてください。

Always include mob-critic (or equivalent) for risky changes.

```
[正しい / CORRECT]
flash-mob for security change:
- planner
- architect
- mob-critic  ← 必須 / Required
```

### Rule 3: Normalize Before Acting / 実行前に正規化

複雑なタスクでは、実装前に mob-scribe で正規化してください。

For complex tasks, normalize with mob-scribe before implementation.

```
[正しい / CORRECT]
1. plan-mob (with mob-scribe)
2. Human approves summary
3. Implement
```

---

## Quick Decision Tree / クイック決定ツリー

```
Is the task trivial? (1 file, obvious implementation)
├─ Yes → Implement directly
└─ No → Is it high-risk? (security, billing, migrations)
    ├─ Yes → flash-mob → plan-mob (with mob-critic) → review-mob
    └─ No → Is planning needed?
        ├─ Yes → plan-mob
        └─ No → Implement directly
```
