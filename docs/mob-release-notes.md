# モブプログラミングリリースノート

Version 1.0.0 — 2026-02-25

---

## 概要

Mob Programming Orchestration 機能の最初の公式リリース。

---

## 新機能

### コアプロトコル
- 3つのモード: **flash-mob**、**plan-mob**、**review-mob**
- 正規化されたサマリー形式（Objective、Decisions、Risks、Action Plan）
- 日英バイリンガル形式のドキュメント

### エージェント
- `mob-navigator` — 意思決定フローの調整
- `mob-critic` — 仮定への挑戦・リスク発見
- `mob-scribe` — 出力の正規化・要約

### テンプレート
- `templates/mob-plan.md` — plan-mob 用テンプレート
- `templates/mob-review.md` — review-mob 用テンプレート
- `templates/mob-decision-log.md` — 決定ログテンプレート

### 実行例
- `examples/mob-flash-example.md` — 認証システムリファクタリングの flash-mob 例
- `examples/mob-plan-example.md` — E2E テスト基盤追加の plan-mob 例
- `examples/mob-review-example.md` — セキュリティ変更レビューの review-mob 例

### ドキュメント
- `MOB_QUICKSTART.md` — 5分で始めるガイド
- `docs/mob-role-boundaries.md` — 役割の境界と選択ガイド
- `rules/mob-programming.md` — 完全なプロトコルとアンチパターン

---

## 文書化されたアンチパターン

1. 決定目標なしのエージェント乱呼び
2. 生トランスクリプトを最終成果物扱い
3. リスク作業での挑発役スキップ
4. 正規化プラン前の実装開始
5. 自明編集でのモブ使用

各アンチパターンに、症状・問題・修正の詳細説明付き。

---

## 既知の制約

### 現在のスコープ
- シムリンクベースの軽量インストールのみ対応
- 外部ツール統合なし（Jira、GitHub Projects など）

### メトリクス
- ローカル JSONL metrics と `metrics:report` CLI が利用可能
- ダッシュボードや外部集計基盤は未実装

### ツール
- ヘルパースクリプトは提供しない（手動プロセス）

---

## 今後の改善方向

### 可能な拡張
- メトリクスダッシュボード
- 外部ツール統合（Jira、GitHub Projects）
- 自動化されたテンプレート生成
- セッション履歴の保存・検索

---

## 移行ガイド

### 新規ユーザー

1. `MOB_QUICKSTART.md` を読む
2. 実行例を確認する (`examples/`)
3. 最初の flash-mob を試す

### 既存ユーザー（プロトタイプ利用者）

1. `rules/mob-programming.md` のアンチパターンセクションを確認
2. 新しいテンプレート (`templates/mob-*.md`) を使用
3. 日英バイリンガル形式に従う

---

## 互換性

- **Claude Code**: すべてのバージョン対応
- **Model**: Opus 4.6 推奨（mob-navigator 向け）
- **Platform**: macOS, Linux, Windows 対応

---

## サポート

- Issues: https://github.com/yyyyyyy0/mantra/issues
- Documentation: `rules/mob-programming.md`

---

## 謝辞

この機能は、複雑なソフトウェア開発における意思決定の質と安全性を向上させるために設計されました。

---

**End of Release Notes**
