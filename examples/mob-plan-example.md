# Plan-Mob Example / Plan-Mob 実行例

## Context / 文脈

E2E テスト基盤をプロジェクトに追加することを計画している。現在、単体テストはあるが、主要なユーザーフロー（ログイン、購入、パスワードリセット）をカバーする E2E テストがない。

Planning to add E2E testing infrastructure to the project. Currently have unit tests, but no E2E coverage for critical user flows (login, purchase, password reset).

---

## Participants / 参加者

- `mob-navigator` — 調整役 / Orchestrator
- `planner` — 実装計画 / Implementation planning
- `architect` — システム設計 / System design
- `tdd-guide` — テスト戦略 / Test strategy
- `mob-critic` — 挑発的レビュー / Adversarial review
- `mob-scribe` — 正規化・要約 / Normalization and summary

---

## Discussion Transcript / 議論トランスクリプト（簡略化）

### mob-navigator

[OBSERVATION] Project has unit test coverage (~65%) but no E2E tests. Critical user flows are untested.

[DECISION POINT] What E2E framework to use? What should be the first flow to test?

### architect

[OBSERVATION] Current tech stack: Next.js 14, React 18, TypeScript. Deployment target: Vercel.

[PROPOSAL] Use Playwright with Next.js integration. Good TypeScript support, fast execution.

[CHALLENGE] CI/CD pipeline needs to handle E2E tests. Current GitHub Actions workflow only runs unit tests.

### planner

[PROPOSAL] Implementation phases:
1. Setup Playwright in dev environment
2. Configure GitHub Actions for E2E
3. Implement first test: login flow
4. Add purchase flow test
5. Add password reset flow test

[RISK] Phase 2 may require GitHub Actions runner upgrade (timeout issues).

### tdd-guide

[PROPOSAL] Follow TDD: Write failing test first, then implement page objects, then make test pass.

[CHALLENGE] Page Object Model or Page Object Pattern? Recommendation: Page Object Model for better maintainability.

[ACTION] First test should be "login with valid credentials succeeds" - simplest critical path.

### mob-critic

[CHALLENGE] What about flaky tests? E2E tests are notorious for flakiness.

[RISK MEDIUM] Timing-dependent tests may fail intermittently. Need explicit waits, not arbitrary sleeps.

[RISK LOW] Test data management. Should we use dedicated test database or seeding?

[PROPOSAL] Use test-specific database with seeded data. Avoid flakiness from shared state.

### mob-navigator

[DECISION] Playwright + Page Object Model + test database approach.

[ACTION] Documented in mob-scribe summary for human approval.

---

## Normalized Summary / 正規化されたサマリー（mob-scribe 出力）

### Objective / 目的
E2E テスト基盤の実装計画、受入条件、検証戦略を確定する。

Establish implementation plan, acceptance criteria, and verification strategy for E2E testing infrastructure.

### Constraints / 制約
- Next.js 14 / React 18 / TypeScript
- デプロイ先: Vercel
- 現在の CI: GitHub Actions（単体テストのみ）

- Next.js 14 / React 18 / TypeScript
- Deployment target: Vercel
- Current CI: GitHub Actions (unit tests only)

### Observations / 観察
- 単体テストカバレッジ約 65%
- E2E テストなし
- 主要ユーザーフロー: ログイン、購入、パスワードリセット

- Unit test coverage ~65%
- No E2E tests
- Critical user flows: login, purchase, password reset

### Decisions / 決定

**Accepted / 採用**
- フレームワーク: Playwright（Next.js 統込み、TypeScript サポート）
- パターン: Page Object Model
- テストデータ: 専用テストデータベース + シードデータ
- 最初のテスト: 「有効な認証情報でのログインが成功する」

- Framework: Playwright (with Next.js integration, TypeScript support)
- Pattern: Page Object Model
- Test data: Dedicated test database with seeded data
- First test: "Login with valid credentials succeeds"

**Rejected / 却下**
- 共有データベースの使用（フリキー性の原因）
- CSS セレクタベースのロケーター（不安定）

- Shared database (causes flakiness)
- CSS selector-based locators (unstable)

**Deferred / 先送り**
- Visual Regression Testing の追加（基本フロー安定後）
- パフォーマンステストの追加（機能テスト安定後）

### Risks / リスク

| 優先度 | 内容 | 緩和策 |
|--------|------|--------|
| MEDIUM | CI 実行時間の増加 | 並列実行構成 |
| MEDIUM | フリキーテスト | 明示的待機、固定スリープを回避 |
| LOW | テストデータ管理 | テスト専用 DB + 各テスト前にリセット |

### Action Plan / アクション計画
1. Playwright を開発環境にセットアップ
2. GitHub Actions に E2E ジョブを追加（並列実行構成）
3. Page Object Model 構造を作成
4. ログインフローテストを実装（TDD: RED → GREEN → IMPROVE）
5. 購入フローテストを追加
6. パスワードリセットフローテストを追加

### Open Questions / 未解決事項
- CI ランナーのアップグレードが必要か？（実行後に評価）
- テスト実行頻度: 各 PR か、夜間のみか？（人間に委譲）

---

## Acceptance Criteria / 受入条件

- [ ] Playwright がローカル環境で動作する
- [ ] GitHub Actions で E2E テストが実行される
- [ ] ログインフローのテストが通る
- [ ] 購入フローのテストが通る
- [ ] パスワードリセットフローのテストが通る
- [ ] フリキーテストの割合が 5% 未満

- [ ] Playwright runs in local environment
- [ ] E2E tests execute on GitHub Actions
- [ ] Login flow test passes
- [ ] Purchase flow test passes
- [ ] Password reset flow test passes
- [ ] Flaky test rate < 5%

## Verification Strategy / 検証戦略

**Unit Tests / 単体テスト**
- Page Object Model の各メソッド
- テストヘルパー関数

**Integration Tests / 統合テスト**
- GitHub Actions との統合
- テストデータベースのシード機能

**E2E Tests / E2E テスト**
- 3つの主要ユーザーフロー

**Manual Verification / 手動検証**
- ローカル環境での `npm run test:e2e` 実行
- レポートファイルの視認性確認

---

## Key Takeaways / 重要ポイント

1. **plan-mob の価値**: 実装前にフレームワーク、パターン、リスク、受入条件が確定した
2. **tdd-guide の貢献**: TDD アプローチと Page Object Model が明確になった
3. **mob-critic の貢献**: フリキーテストのリスクと緩和策が議論された
4. **次のステップ**: 人間による承認後、実装開始

1. **Value of plan-mob**: Framework, pattern, risks, and acceptance criteria determined before implementation
2. **tdd-guide contribution**: TDD approach and Page Object Model clarified
3. **mob-critic contribution**: Flaky test risks and mitigations discussed
4. **Next step**: Human approval, then start implementation
