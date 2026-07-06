#!/usr/bin/env bash
# p-judge.sh — mantra P0-P4 判定 UserPromptSubmit hook
#
# rules/agents.md の P0-P4 ラダー（Immediate Agent Usage）をヒューリスティックに判定し、
# 該当する場合のみ「[mantra] P判定: ...」をコンテキストに強制注入する。
# プロンプト（貼り紙）ではなく hooks（信号機）でエージェント自動起動を促す機構化（Track D 段階1）。
#
# 入力: stdin に UserPromptSubmit の JSON（.prompt または .message にユーザープロンプト）
# 出力: 該当あり → {"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"..."}}
#       該当なし(P0) → 何も出力しない（静音）
#
# 判定バックエンドは MANTRA_PJUDGE_BACKEND で差し替え可能:
#   heuristic (既定) … キーワード/ヒューリスティック
#   haiku            … claude -p --model haiku に委譲（精度不足時の将来オプション）
#
# 設計方針: hook は絶対にプロンプト投入を壊さない。依存欠落・異常時は静かに exit 0。

set -uo pipefail

# jq が無ければ静かに諦める（プロンプトは通常通り通す）
command -v jq >/dev/null 2>&1 || exit 0

input=$(cat 2>/dev/null || true)
[ -n "$input" ] || exit 0

prompt=$(printf '%s' "$input" | jq -r '.prompt // .message // ""' 2>/dev/null || true)
[ -n "$prompt" ] || exit 0

# --- ヒューリスティック判定 ---------------------------------------------------
# 小文字化して英日キーワードで走査。該当した P レベルの助言行を stdout に1行ずつ出す。
judge_heuristic() {
  local text
  text=$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')

  # P3: 高リスクスコープ（security / auth / billing / migration / data-integrity）
  if printf '%s' "$text" | grep -qiE 'security|auth(entication|orization)?|login|credential|password|secret|token|encrypt|billing|payment|invoice|subscription|migration|migrate|schema change|data integrity|セキュリティ|認証|認可|ログイン|パスワード|秘密鍵|暗号|課金|決済|請求|サブスク|マイグレーション|スキーマ変更|データ整合'; then
    echo 'P3(高リスク) → security/auth/billing/migration/data-integrity を検知。mob-navigator で分解し、mob-critic + security-reviewer を必ず含める（FM-AGENT-CRITIC）'
  fi

  # P1: planner 条件（3+ステップ / 2+ファイル / 実装・非自明な判断）
  if printf '%s' "$text" | grep -qiE 'implement|refactor|feature|build |rewrite|redesign|architecture|multiple files|across files|実装|リファクタ|機能追加|作って|設計|作り直|複数ファイル|横断|アーキ|移行|多段' \
     || printf '%s' "$text" | grep -qiE '[3-9]\+? ?(steps|files|つ|個|箇所|ファイル|ステップ)'; then
    echo 'P1 → 3+ステップ / 2+ファイル / 非自明な実装判断の可能性。planner を先に起動（複雑なら architect も）'
  fi

  # P4: code-reviewer 条件（非自明なコード変更 → 実装後にレビュー）
  if printf '%s' "$text" | grep -qiE 'implement|refactor|feature|fix bug|バグ修正|実装|リファクタ|機能追加|修正|コード|関数|クラス|エンドポイント|api'; then
    echo 'P4 → 非自明なコード変更。実装が終わったら code-reviewer を起動（docs-only の軽微編集は不要）'
  fi
}

# haiku バックエンド（将来の差し替えポイント）。失敗時はヒューリスティックへフォールバック。
judge_haiku() {
  command -v claude >/dev/null 2>&1 || { judge_heuristic "$1"; return; }
  local out
  out=$(printf '%s' "$1" | claude -p --model haiku \
    'あなたは mantra の P0-P4 判定器。次のユーザープロンプトに対し rules/agents.md の P0-P4 ラダーで該当する助言を、"Pn → 理由 起動対象" 形式で1行ずつ出力。該当なしなら空文字。プロンプト:' \
    2>/dev/null || true)
  if [ -n "$out" ]; then printf '%s\n' "$out"; else judge_heuristic "$1"; fi
}

case "${MANTRA_PJUDGE_BACKEND:-heuristic}" in
  haiku) verdict=$(judge_haiku "$prompt") ;;
  *)     verdict=$(judge_heuristic "$prompt") ;;
esac

# 該当なし = P0（静音）
[ -n "$verdict" ] || exit 0

# 「[mantra] P判定:」ヘッダ + 各助言行を additionalContext として注入
message=$(printf '[mantra] P判定（rules/agents.md ラダー・自動注入）:\n%s' \
  "$(printf '%s' "$verdict" | sed 's/^/- /')")

jq -cn --arg ctx "$message" \
  '{hookSpecificOutput:{hookEventName:"UserPromptSubmit",additionalContext:$ctx}}'
