# モブプログラミングクイックスタート

5分でモブプログラミングを始めるガイド。

---

## Step 1: モードを選択

あなたのタスクに適したモードを選択してください。

| モード | 使用ケース | 参加者例 |
|--------|-----------|----------|
| **flash-mob** | `single-agent`で進める前提だが、`3+ steps` / `2+ files` / 曖昧性高のときに実施 | planner, architect, mob-critic, mob-navigator |
| **plan-mob** | flash 後も未解決判断が残る場合、またはリスクが高い設計判断が残る場合 | planner, architect, tdd-guide, mob-critic, mob-scribe |
| **review-mob** | コード変更後の品質確認、または高リスク変更の最終確認 | code-reviewer, security-reviewer, mob-critic, mob-scribe |

**決定ガイド**:
- 1ファイルの明確な修正・typo は直接対応（mobなし）
- 実装前に不確実性が高く、かつ 3+ steps / 2+ files の場合 → **flash-mob**
- flash でも判断が残る場合 → **plan-mob**
- コード変更後の確認が必要な場合 → **review-mob**

---

## Step 2: 最初のモブセッションを実行

### flash-mob の例

```
あなた: 認証システムのリファクタリングを検討している。リスクを知りたい。

Claude: mob-navigator エージェントを起動して、意思決定フローを調整します...
```

### plan-mob の例

```
あなた: E2E テスト基盤を追加したい。実装計画を作成してほしい。

Claude: planner + architect + tdd-guide + mob-critic + mob-scribe を起動します...
```

### review-mob の例

```
あなた: セキュリティ変更の PR をレビューしてほしい。

Claude: code-reviewer + security-reviewer + mob-critic + mob-scribe を起動します...
```

---

## Step 3: 出力を確認

各モブセッションは以下を含む正規化されたサマリーを生成します：

- **目的** — 何を決定したか
- **観察** — 確立された事実
- **決定** — 採択/却下/先送り
- **リスク** — 優先度付きリスクと緩和策
- **アクション計画** — 次の1-5ステップ

---

## Step 4: 人間による承認

**重要**: モブセッションの出力は、人間による承認ゲートを通じてから実装を開始してください。

推奨承認ゲート:
1. **Plan approval** — plan-mob の後
2. **Implementation start approval** — リスクの高い変更の場合
3. **Merge readiness approval** — review-mob の後

---

## Step 5: 詳細ドキュメントへ

- **完全なプロトコル**: `rules/mob-programming.md`
- **エージェント詳細**: `agents/mob-*.md`
- **実行例**: `examples/mob-*-example.md`
- **テンプレート**: `templates/mob-*.md`
- **役割境界**: `docs/mob-role-boundaries.md`

---

## クイックリファレンス

### mob-navigator
意思決定フローを調整し、専門家を呼び出す順序を決定します。

### mob-critic
仮定に挑戦し、リスクを表面化します。

### mob-scribe
マルチエージェントの出力を正規化されたサマリーにまとめます。

---

## 次のステップ

1. 実行例を確認する: `examples/mob-flash-example.md`
2. テンプレートを使う: `templates/mob-plan.md`
3. 詳細ルールを読む: `rules/mob-programming.md`
