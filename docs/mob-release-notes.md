# Mob Programming Release Notes / モブプログラミングリリースノート

Version 1.0.0 — 2026-02-25

---

## Overview / 概要

Mob Programming Orchestration 機能の最初の公式リリース。

First official release of Mob Programming Orchestration feature.

---

## What's New / 新機能

### Core Protocol / コアプロトコル
- 3つのモード: **flash-mob**、**plan-mob**、**review-mob**
- 正規化されたサマリー形式（Objective、Decisions、Risks、Action Plan）
- 日英バイリンガル形式のドキュメント

- 3 modes: **flash-mob**, **plan-mob**, **review-mob**
- Normalized summary format (Objective, Decisions, Risks, Action Plan)
- Bilingual (English/Japanese) documentation

### Agents / エージェント
- `mob-navigator` — 意思決定フローの調整 / Decision flow orchestration
- `mob-critic` — 仮定への挑戦・リスク発見 / Assumption challenging, risk discovery
- `mob-scribe` — 出力の正規化・要約 / Output normalization and summary

### Templates / テンプレート
- `templates/mob-plan.md` — plan-mob 用テンプレート
- `templates/mob-review.md` — review-mob 用テンプレート
- `templates/mob-decision-log.md` — 決定ログテンプレート

### Examples / 実行例
- `examples/mob-flash-example.md` — 認証システムリファクタリングの flash-mob 例
- `examples/mob-plan-example.md` — E2E テスト基盤追加の plan-mob 例
- `examples/mob-review-example.md` — セキュリティ変更レビューの review-mob 例

### Documentation / ドキュメント
- `MOB_QUICKSTART.md` — 5分で始めるガイド / Get started in 5 minutes
- `docs/mob-role-boundaries.md` — 役割の境界と選択ガイド / Role boundaries and selection guide
- `rules/mob-programming.md` — 完全なプロトコルとアンチパターン / Complete protocol and anti-patterns

---

## Anti-patterns Documented / 文書化されたアンチパターン

1. 決定目標なしのエージェント乱呼び / Calling many agents without a decision target
2. 生トランスクリプトを最終成果物扱い / Treating raw transcripts as the final artifact
3. リスク作業での挑発役スキップ / Skipping challenge roles on risky work
4. 正規化プラン前の実装開始 / Starting implementation before a normalized plan exists
5. 自明編集でのモブ使用 / Using mob orchestration for trivial edits

各アンチパターンに、症状・問題・修正の詳細説明付き。

Each anti-pattern includes symptom, problem, and fix details.

---

## Known Limitations / 既知の制約

### Current Scope / 現在のスコープ
- シムリンクベースの軽量インストールのみ対応 / Only symlink-based lightweight installation
- 外部ツール統合なし（Jira、GitHub Projects など）/ No external tool integrations (Jira, GitHub Projects, etc.)

### Metrics / メトリクス
- ローカル JSONL metrics と `metrics:report` CLI が利用可能 / Local JSONL metrics and the `metrics:report` CLI are available
- ダッシュボードや外部集計基盤は未実装 / Dashboards and external analytics remain out of scope

### Tooling / ツール
- ヘルパースクリプトは提供しない（手動プロセス） / No helper scripts provided (manual process)

---

## Future Improvements / 今後の改善方向

### Potential Enhancements / 可能な拡張
- メトリクスダッシュボード / Metrics dashboard
- 外部ツール統合（Jira、GitHub Projects）/ External tool integrations
- 自動化されたテンプレート生成 / Automated template generation
- セッション履歴の保存・検索 / Session history storage and search

---

## Migration Guide / 移行ガイド

### For New Users / 新規ユーザー

1. `MOB_QUICKSTART.md` を読む / Read `MOB_QUICKSTART.md`
2. 実行例を確認する (`examples/`) / Review examples
3. 最初の flash-mob を試す / Try your first flash-mob

### For Existing Users / 既存ユーザー（プロトタイプ利用者）

1. `rules/mob-programming.md` のアンチパターンセクションを確認
2. 新しいテンプレート (`templates/mob-*.md`) を使用
3. 日英バイリンガル形式に従う

---

## Compatibility / 互換性

- **Claude Code**: すべてのバージョン対応 / All versions supported
- **Model**: Opus 4.6 推奨 / Opus 4.6 recommended for mob-navigator
- **Platform**: macOS, Linux, Windows 対応 / Cross-platform support

---

## Support / サポート

- Issues: https://github.com/yyyyyyy0/mantra/issues
- Documentation: `rules/mob-programming.md`

---

## Acknowledgments / 謝辞

この機能は、複雑なソフトウェア開発における意思決定の質と安全性を向上させるために設計されました。

This feature was designed to improve decision quality and implementation safety in complex software development.

---

**End of Release Notes**
