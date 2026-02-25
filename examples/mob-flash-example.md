# Flash-Mob Example / Flash-Mob 実行例

## Context / 文脈

既存の認証システム（JWT + Session 混在）を統一された認証基盤にリファクタリングすることを検討している。変更範囲が大きいため、実装前に主要なリスクを特定したい。

**Existing authentication system** (JWT + Session mixed) needs to be refactored into a unified authentication base. Due to the large scope, we want to identify major risks before implementation.

---

## Participants / 参加者

- `mob-navigator` — 調整役 / Orchestrator
- `planner` — 実装計画の視点 / Implementation planning perspective
- `architect` — システム設計の視点 / System design perspective
- `mob-critic` — 挑発的レビュー / Adversarial review

---

## Discussion Transcript / 議論トランスクリプト（簡略化）

### mob-navigator

[OBSERVATION] Current codebase has JWT-based auth for API routes and session-based auth for web routes. Two separate middleware stacks, duplicated user lookup logic.

[PROPOSAL] Migrate to unified JWT-based auth with refresh token rotation.

### planner

[OBSERVATION] This touches 15+ files across auth/, middleware/, and routes/.

[CHALLENGE] Do we have a clear migration path? Rolling update or big bang?

### architect

[PROPOSAL] Implement feature-flagged dual-write period. New JWT auth runs in shadow mode first.

[RISK] Token rotation logic is complex. Edge case: concurrent requests with expired refresh token.

### mob-critic

[CHALLENGE] What about existing active sessions? Big bang approach would log out all users.

[RISK] Shadow mode may hide race conditions in token validation.

[RISK] Refresh token storage needs secure HTTP-only cookies. Current implementation doesn't have this.

### mob-navigator

[DECISION] Approve feature-flagged migration approach with dual-write period.

[RISK HIGH] Concurrent refresh token requests need idempotency handling.

[ACTION] architect to design token storage and rotation logic. planner to create migration phases.

---

## Normalized Summary / 正規化されたサマリー

### Objective / 目的
認証システム統一リファクタリングの主要リスクを特定し、実装アプローチを決定する。

Identify major risks for authentication system unification refactor and determine implementation approach.

### Constraints / 制約
- 既存のアクティブセッションを切断しない
- 1時間以上のダウンタイムは許容しない

- Must not interrupt existing active sessions
- No more than 1 hour of downtime allowed

### Observations / 観察
- 現在：API ルートは JWT、Web ルートは Session が混在
- 15+ ファイルに影響
- 現在の実装に HTTP-only Cookie がない

- Current: Mixed JWT for API routes, Session for web routes
- Affects 15+ files
- No HTTP-only cookies in current implementation

### Decisions / 決定

**Accepted / 採択**
- JWT ベースの統一認証への移行
- 機能フラグ付きデュアルライト期間による移行
- リフレッシュトークンローテーションの採用

**Rejected / 却下**
- Big bang 方式（全ユーザーのセッション切断につながるため）

**Deferred / 先送り**
- トークン保存方法の詳細（セキュアストレージの選定待ち）

### Risks / リスク

| 優先度 | 内容 | 緩和策 |
|--------|------|--------|
| HIGH | 並行リフレッシュトークンリクエストの重複発行 | 冪等性キーの実装 |
| HIGH | HTTP-only Cookie 未使用 | 移行前に Cookie 設定を実装 |
| MEDIUM | シャドウモードでの検証漏れ | カナリアリリースで検証 |
| LOW | 既存セッションの移行ロジック | デュアルライト期間で検証 |

### Action Plan / アクション計画
1. architect: トークン保存とローテーションロジックの設計
2. planner: 移行フェーズの詳細計画（デュアルライト期間の定義）
3. 次回セッションで plan-mob を実行し、受入条件を確定

### Open Questions / 未解決事項
- トークンの有効期限を何分に設定するか？
- ローテーションの失敗時にユーザーにどうフィードバックするか？

---

## Key Takeaways / 重要ポイント

1. **flash-mob の価値**: 実装前に HIGH リスク（並行リクエスト、Cookie 設定）を特定できた
2. **mob-critic の貢献**: Big bang 方式のリスクを指摘し、より安全なデュアルライト方式へ誘導
3. **次のステップ**: 具体的な設計と計画のために plan-mob へ移行

1. **Value of flash-mob**: Identified HIGH risks (concurrent requests, cookie settings) before implementation
2. **mob-critic contribution**: Pointed out big bang risks, guided toward safer dual-write approach
3. **Next step**: Move to plan-mob for concrete design and planning
