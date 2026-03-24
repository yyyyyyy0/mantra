# Harness Engineering MVH

> **このドキュメントは repo 導入パスの正本です。**
> README からリンクされており、既存 repo に mantra のハーネスを導入する際の canonical reference として位置づけられています。

このドキュメントは、この Mac 上の複数 repo に共通で入れる最小実行可能ハーネス
（MVH: Minimum Viable Harness）の正本です。

目標は「深い repo ごとの差異を残したまま、毎回迷わず同じ入口で始められる薄い共通層」を作ることです。

## TL;DR: Adoption Path

既存 repo に MVH を導入する 4 ステップ：

1. **Thin AGENTS.md** — [テンプレート](../../templates/repo-agents-pointer.md) をベースにポインタ型 AGENTS.md を置く
2. **Canonical verify** — repo で 1 本の検証コマンドを定め、AGENTS.md に明記する
3. **Hook contract** — [repo pre-push テンプレート](../../templates/repo-pre-push.example.sh) で canonical verify を毎 push で呼ぶ
4. **Session continuity** — `maw handover/takeover` と [Obsidian ledger テンプレート](../../templates/repo-obsidian-ledger.md) でセッション引き継ぎ

具体的な walkthrough は [examples/ail-repo-improvement-loop.md](../../examples/ail-repo-improvement-loop.md) を参照。

## 1. Thin AGENTS Contract

`AGENTS.md` は入口だけを持ち、仕様・背景・長い運用メモは別ドキュメントへ送ります。

必須要素:

- `Purpose`: この repo のハーネス上の優先事項
- `Canonical verify`: まず実行すべき 1 本の検証コマンド
- `Test ladder`: unit / visual / acceptance の位置づけ
- `Session continuity`: `maw handover/takeover` と ledger の参照先
- `Canonical docs`: 詳細の SSOT

非推奨:

- エージェント一覧の長文再掲
- 詳細 runbook のコピペ
- 実装仕様の長文化
- 同じ趣旨の rule を複数ファイルへ重複記載

推奨長さ:

- 1 画面で読める量
- まず最初の 60 秒で「どこを見て、何を打てばよいか」が分かる量

## 2. Policy-as-Code Hooks

ハーネス上の hook は「説明」ではなく「機械で実行される軽いガード」を置きます。

### PreToolUse / Pre-execution

責務:

- 破壊的操作の遮断または確認
- dirty tree での直接編集を避ける
- `maw` / worktree の利用を促す
- 高リスク作業を plan-first に戻す

代表例:

- `git reset --hard`, `rm -rf`, `fly deploy`, `sudo` を即時ブロック
- 3+ step / migration / public contract change は plan-first を促す
- 既存未コミット差分がある tree では隔離 workspace を要求する

### PostToolUse / Post-edit

責務:

- 変更直後の軽量 verify
- changed-file 単位の lint / typecheck
- 補助 artifact の場所を示す

代表例:

- TypeScript 編集後に `tsc --noEmit` または repo verify の軽量版
- visual diff の出力先を案内
- 受け入れテスト runbook への導線を出す

### Stop / Session end

責務:

- verify 漏れ検知
- handover 漏れ検知
- 継続に必要な evidence の確認

代表例:

- 変更があるのに verify 実行記録が無ければ警告
- `maw` workspace なら `maw handover` 未実施を警告
- ledger に `next step` と `evidence refs` が無ければ補完を促す

### Repo Hook Contract

editor/tool hook が無い環境でも最低限効くように、repo 側には `pre-push` を置きます。

期待値:

- 1 repo 1 command の canonical verify を呼ぶ
- 追加で重い visual / acceptance は手動トリガに残す
- 実行時間は「毎 push で耐えられる」範囲に抑える

ひな形は [templates/repo-pre-push.example.sh](../../templates/repo-pre-push.example.sh) を使います。

## 3. Plan / Execute Split

次の条件では plan-first を既定にします。

- 3 つ以上の実装ステップ
- 2 ファイル以上で public behavior が変わる
- migration / auth / billing / data loss risk
- rollback が難しい

軽微な docs-only や 1 ファイルの明確な修正では single-agent execute-first で構いません。

重要なのは「plan-first を AGENTS に長文で埋める」ことではなく、「高リスク時だけ確実に戻れること」です。

## 4. Canonical Verify Contract

各 repo は人間にも agent にも分かりやすい 1 本の verify command を持ちます。

例:

- `eval "$(mise env -s zsh)" && npm run verify`
- `corepack yarn validate`
- `npm run check`

補助的な test は ladder で扱います。

### Test ladder

- `default`: unit / lint / typecheck / contract
- `visual`: UI, rendering, CLI layout 変更時のみ
- `acceptance`: 重要フロー、外部連携、リリース前ゲートのみ

原則:

- visual を常時必須にしない
- acceptance を全 push に載せない
- ただし runbook と artifact の置き場は常に明示する

## 5. Session Continuity Contract

継続の source of truth は `maw handover/takeover` です。

Obsidian は検索・俯瞰・一覧のための index として使い、handover の代替にはしません。

最低限そろえるメタデータ:

- `repo`
- `branch_or_workspace`
- `goal`
- `blockers`
- `next_step`
- `evidence_refs`
- `updated_at`

Obsidian 用の雛形は [templates/repo-obsidian-ledger.md](../../templates/repo-obsidian-ledger.md) を使います。

## 6. Recommended Rollout

1. `AGENTS.md` をポインタ型へ薄くする
2. canonical verify command を明記する
3. repo `pre-push` を canonical verify に寄せる
4. visual / acceptance の手動 runbook を docs へ寄せる
5. `maw handover/takeover` と ledger をセットで運用する
