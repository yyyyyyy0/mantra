# 旧ルール → 新ルール対応表（P1、2026-10-15）

旧ルール 12 ファイル（タグ `pre-redesign` 時点）と、`~/.claude/CLAUDE.md`・メモリの関連部分について、記述ごとに移し先を記録する。あとで「この振る舞いを戻したい」となったときは、この表から該当行を探し、`git show pre-redesign:rules/<file>` で元の文を取り出して、新ルールに 1 行だけ足す。

処置の記号は次のとおり。

| 記号 | 処置 |
|---|---|
| **K** | 残した |
| **M** | 別の行に統合した |
| **A** | エージェントの定義へ移した |
| **H** | hook で強制する |
| **D** | 文書へ移した |
| **N** | Claude Code の標準機能と重複するため削除した |
| **I** | 書かなくても正しくやれる（推測できる）ため削除した |
| **U** | 未使用のため削除した（根拠は MODERNIZATION_PLAN §3） |
| **R** | 機能ごと退役させた |
| **C** | 現行モデルの指針と矛盾するため削除した |

新ルールのファイル名:
- delegation.md（委譲とレビュー）
- performance.md（モデルとコスト）
- failure-modes.md（失敗パターン）
- git-workflow.md（作業規約）

## agents.md（→ delegation.md に改名して書き直した）

| 旧記述 | 処置 | 移し先・理由 |
|---|---|---|
| Available Agents の表（13 体） | M / U | delegation.md の Roster（4 体と組み込みエージェント）。残りの 10 体は起動 0 回 |
| P0（一人でやる道筋） | I | — |
| P1 planner の条件（3 ステップ以上 / 2 ファイル以上 / 曖昧） | K | delegation.md「Do without being asked」1 項目め |
| P2 replan | U | 起動 0 回 |
| P3 高リスク → mob | K | 同 3 項目め（mob-critic と security-reviewer） |
| P4 code-reviewer | K | 同 2 項目め |
| Plan / Execute 分離 | K | 同 1 項目め |
| AGENTS.md を薄く保つ、verify コマンドは 1 本 | D | docs/ja/harness-engineering.md と templates/ |
| サブエージェントを使う計画への明記の段落（10-15 追加） | K | delegation.md「Plans」。文言を変えずに移した |
| フェーズ別の経路（planner → architect、並列調査） | U | architect は起動 0 回 |
| クリーンアップは機能のコミット後に分ける | M | FM-CODE-SCOPE |
| 独立した作業は並列で実行する | K | delegation.md「Working with subagents」 |
| 役割を分けた多視点分析（事実確認役・シニア役など） | C | 役柄を与えても精度は上がらない（MODERNIZATION_PLAN §4） |
| Mob Orchestration の節 | R | mob のモードは使用 0 回。critic だけ残した |
| FM-AGENT-TARGET / FM-READ の再掲 | K / M | 「decision target and done condition」と FM-PLAUSIBLE |

## coding-style.md（削除）

| 旧記述 | 処置 | 理由 |
|---|---|---|
| 不変性（CRITICAL） | I | everything-claude-code の JS 向け既定値。周囲のコードに合わせれば足りる。**個人の好みなら戻す候補** |
| ファイルの大きさ（200〜400 行、最大 800 行） | I | — |
| エラー処理を網羅する | C | Fable 5 ガイドに「起こりえない場面のエラー処理を足さない」とある |
| zod による入力検証 | I / C | 境界での検証は既定でできる |
| 品質チェックリスト | I | console.log の禁止だけ K（git-workflow.md） |

## failure-modes.md（書き直した）

| 旧 FM | 処置 | 移し先・理由 |
|---|---|---|
| FM-READ / FM-PLAUSIBLE / FM-SKIP-CHECK / FM-TEST-PASS | M | FM-PLAUSIBLE にまとめた |
| FM-SUMMARY | M | delegation.md「A subagent's report is a claim」 |
| FM-RETRY | M | FM-GIT-NOVERIFY の末尾に入れた。サブエージェントには標準のシステムプロンプトのこの指示が入らないため |
| FM-VAGUE | A | planner の出力ルール（具体的な質問だけをする） |
| FM-VERSION | K | 文言を変えずに残した |
| FM-TEST-FIX | K | — |
| FM-SEC-INTERNAL | A | security-reviewer の「信頼できない機械入力」の項目（hook の stdin、transcript、他のエージェントの出力など）。常時読み込みには入れない |
| FM-SEC-SILENCE | A | security-reviewer |
| FM-GIT-AMEND | M | FM-GIT-NOVERIFY の末尾に入れた。標準の git 安全手順とも重なる |
| FM-GIT-NOVERIFY | K + H | `hooks/guard.sh` が `--no-verify` を遮断する |
| FM-CODE-SCOPE / FM-CODE-CREEP | M | FM-CODE-SCOPE にまとめた |
| FM-AGENT-TARGET | K | delegation.md |
| FM-AGENT-CRITIC | K | 文言を変えずに残した |
| 各ファイル末尾の「Named Failure Modes」再掲 | R | 重複していたため |

## git-workflow.md（書き直した）

| 旧記述 | 処置 | 理由 |
|---|---|---|
| コミット形式と type 一覧 | K | — |
| Attribution を無効にしていること | N | settings.json の `attribution` で設定済み |
| PR の手順（全履歴を確認、diff を見る、push -u） | N / I | Claude Code 標準の PR 手順と重なる。verify、レビュー、テスト計画は K |
| 機能開発の流れ（計画 → TDD → レビュー → コミット） | K / U | 計画とレビューは K。tdd-guide は起動 0 回 |
| TDD と 80% カバレッジ | M | 「Follow the repo's coverage gate」に弱めた。**全リポジトリ共通で 80% を義務にしたいなら戻す候補** |

## hooks.md（削除）

| 旧記述 | 処置 | 移し先・理由 |
|---|---|---|
| hooks を policy-as-code として扱う考え方 | D | docs/ja/harness-engineering.md（P3） |
| PreToolUse で危険な操作を止める | H | `hooks/guard.sh` |
| PostToolUse の lint、Stop のチェック、maw handover | D / U | 各リポジトリの設定に任せる。Stop の handover 催促は表示されていなかった（`userMessage` が無効） |
| リポジトリ側に pre-push を置く | D | `templates/repo-pre-push.example.sh` |
| 自動承認の注意、`dangerously-skip-permissions` を使わない | N | 権限モードと auto mode の分類器で扱われる |
| Todo で進捗を管理する | N | 標準のタスク管理ツールがある |

## mob-programming.md（削除）

| 旧記述 | 処置 | 移し先・理由 |
|---|---|---|
| flash / plan / review-mob、navigator、scribe、要約の書式 | R | 使用 0 回。必要になったら `git show pre-redesign:rules/mob-programming.md` で戻せる |
| 高リスクのときは反論役を入れる | K | FM-AGENT-CRITIC、delegation.md |
| 起動する前に、何を決めるのかを定める | K | delegation.md |
| 人の判断ゲート | K | delegation.md の「計画を見せて OK を待つ」と、git-workflow.md の「Merge only with the user's approval」 |

## patterns.md（削除）

| 旧記述 | 処置 | 理由 |
|---|---|---|
| ApiResponse、useDebounce、Repository の各パターン | I | 汎用のスニペット |
| 実績のある雛形を探してから作る | K | git-workflow.md「既存の道具を先に確認する」（ユーザーの方針「既製品を試す」と一致する） |

## performance.md（書き直した）

| 旧記述 | 処置 | 移し先・理由 |
|---|---|---|
| Delegation Criteria と、モデルの対応表 | K | Codex を外し、コード生成を sonnet に移した |
| 委譲すべき場合 / すべきでない場合 | K | — |
| コンテキストの終盤 20% を避ける | N | 自動 compact がある |
| Ultrathink、Plan Mode、"Rev the engine" | N / C | effort と plan mode に置き換わった |
| ビルド失敗時の対処（build-error-resolver） | U | 起動 0 回 |

## pr-automation.md / security.md / teams.md / testing.md（削除）

| 旧記述 | 処置 | 移し先・理由 |
|---|---|---|
| pr-automation.md の全体 | R | D3 で退役（P2 / P3） |
| security.md: コミット前のチェックリスト、秘密情報の扱い、対応手順 | A / I | security-reviewer。高リスクな変更では delegation.md の 3 項目めで起動する |
| security.md: FM-SEC-* | C / A | failure-modes の表を参照 |
| teams.md: 3 層モデル、TeamCreate / TeamDelete | N / C | ツールが存在しない。delegation.md に Teams と Workflow の扱いを 2 行で書いた |
| teams.md: 並列で書く人には worktree を割り当てる | K | delegation.md |
| teams.md: Codex との連携、最大 3 人までのコスト管理 | R | — |
| testing.md: MUST（unit と契約テスト、80%、CI のゲート） | M | git-workflow.md（リポジトリの基準に従う） |
| testing.md: tdd-guide、e2e-runner | U | 起動 0 回 |

## ~/.claude/CLAUDE.md とメモリ（P4 で反映）

| 旧記述 | 処置 | 移し先・理由 |
|---|---|---|
| ルール参照 | N | rules は自動で読み込まれる |
| 実装の委譲（Codex） | R / K | performance.md（sonnet） |
| myak の節 | — | CLAUDE.md に残す（マシンごとの設定のため） |
| マルチエージェントのモデル選択 | K | performance.md |
| 実装前の状態確認（`git fetch origin main`） | K | git-workflow.md |
| UI 変更時の確認（スクショ） | K | git-workflow.md |
| マルチエージェント間の状態の引き継ぎ | K | delegation.md「Pass forward…」 |
| ファイル削除は trash で | K + H | git-workflow.md と guard.sh |
| メモリ「頼まなくても自動で使う」 | K | delegation.md「Do without being asked」 |
| メモリ「Teams を TeamCreate で自動起動する」 | 変更 | 並列実装の自動起動は、delegation.md の「実装は sonnet のサブエージェントへ」の行と、worktree の行に置き換えた。TeamCreate は 2.1.287 のツール一覧にないことを確認済み。Teams を使うのは、書き手同士が協調し続ける必要があるときに限る。**ユーザーの確認が必要** |
| メモリ「コード生成は Codex」 | R | sonnet のサブエージェント |
