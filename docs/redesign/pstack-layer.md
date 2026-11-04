# pstack の上に mantra を薄く乗せる

状態: 実装済み・未コミット（2026-11-04、ブランチ feat/pstack-layer）。11-12 の P5 測定が終わるまで deploy しない。

## 目的

pstack（Lauren Tan のスキル集）を土台にして、mantra はこのユーザー固有の部分だけを持つ。pstack と重なるルールは消す。pstack に無いか、このユーザーには合わない部分だけを `nil-mode` スキルと always-on ルールに残す。

## pstack の取り込み方

- 出所: `cursor/plugins` の `harness/pstack/claude-code`。ミラー（`backnotprop/pstack`）ではなく公式を使う。
- 固定: `pstack/PIN` にコミット SHA と plugin.json の version を書く。今回は `fd268b808c786469e6dd8c8d9db864d0de4d669e`（pstack 0.15.36）。
- 置き場所: `scripts/pstack.sh` が `~/.mantra/vendor/pstack/<sha>/` に sparse checkout し、`~/.mantra/vendor/pstack/current` をそこへ向ける。中身は書き換えない。
- Claude Code のプラグインとしては入れない。理由は 3 つ。
  - マーケットプレイス経由だとコミット単位で固定できるか確かめられない（FM-VERSION）。
  - 58 スキルの説明がスキル一覧に増える。
  - `setup-pstack` が `~/.claude/rules/pstack-models.md` に書き込む。`~/.claude/rules` は live clone へのリンクなので、live が汚れて `deploy.sh` が止まる。
- `pstack-models.md` は `rules/` にコミットして配る。`setup-pstack` は実行しない。

## 道具の変更（実装仕様）

### `pstack/PIN`

```
repo=https://github.com/cursor/plugins.git
commit=fd268b808c786469e6dd8c8d9db864d0de4d669e
path=harness/pstack/claude-code
version=0.15.36
```

### `scripts/pstack.sh [--dry-run]`

- `pstack/PIN` を読む。`commit` が 40 桁の16進数でなければ拒否する。`repo` は `MANTRA_PSTACK_REPO` で上書きできる（テスト用。ネットワークを使わずにローカルの bare repo を指す）。
- 置き場所は `${MANTRA_VENDOR:-$HOME/.mantra/vendor}/pstack/<commit>/`。既にあり、`git rev-parse HEAD` が `commit` に一致し、`<path>/.claude-plugin/plugin.json` の version が `version` に一致すれば何もしない。
- 無ければ一時ディレクトリで `git init`、`fetch --depth 1 origin <commit>`、`<path>` だけの sparse checkout を行い、上の 2 点と `<path>/skills/poteto-mode/SKILL.md`・`<path>/docs/harness/claude-code.md` の存在を確かめてから、`mv` で置き場所に移す。途中で失敗したら一時ディレクトリだけを消す。
- `${MANTRA_VENDOR}/pstack/current` を `<commit>/<path>` へのシンボリックリンクにする。一時リンクを作って `mv -f` で差し替える。
- `~/.claude` と live clone には触れない。2 回目の実行では何も変えない。古い `<commit>` ディレクトリは消さない。
- `--dry-run` は行う操作を表示するだけ。

### `scripts/install.sh`

- `<live>/skills/<名前>/` ごとに `~/.claude/skills/<名前>` をそこへのシンボリックリンクにする。既存の実ディレクトリは、agents と同じ方法で退避してからリンクする。mantra 以外のスキルには触れない。
- live clone を指していて、リンク先が消えたスキルのリンクは外す（agents の退役と同じ）。
- `${MANTRA_VENDOR}/pstack/current` が無いか、PIN の commit と違うときは警告を出す。取得はしない（`scripts/pstack.sh` はユーザーが実行する）。

### `scripts/verify.sh`

- g. `skills/*/SKILL.md` の frontmatter の `name` がディレクトリ名と一致し、`description` が空でない。
- h. `pstack/PIN` の 4 キーがそろい、`commit` は 40 桁の16進数、`version` は `x.y.z`。
- i. `rules/pstack-models.md` のコメント以外の行が `<role>: <value>[, <value>...]` の形で、値は `<opus|sonnet|haiku|fable> <low|medium|high|xhigh|max>`、`inherit-parent`、`auto` のどれか。
- `performance.md` を delegation.md に統合するので、番兵文字列の `rules/performance.md` を `rules/pstack-models.md` に変える。

### テスト

- `tests/pstack.test.sh`: ローカルの bare repo を fixture にして、初回取得、2 回目は無変更、commit 不一致の拒否、取得失敗時に置き場所が汚れないこと、`current` の差し替え、`--dry-run` が何も変えないことを確かめる。
- `tests/install.test.sh`: スキルのリンク、実ディレクトリの退避、退役リンクの除去、mantra 以外のスキルに触れないこと、pstack の警告。
- `tests/verify.test.sh`: g・h・i の合格例と不合格例。

### mob-critic の指摘を受けた修正（2026-11-04、sonnet、APPROVE-WITH-CHANGES）

上の仕様より、こちらが優先する。

1. **取得の原子性**:
   - 一時ディレクトリは `$MANTRA_VENDOR/pstack/.tmp.XXXXXX`（同じファイルシステム）に作る。
   - 置き場所 `<commit>/` が既にあるのに HEAD か version が合わないときは、`<commit>.bad-<TS>` へ退避してから取り直す。
   - `mv` の直前に宛先が無いことを確かめ、あれば止める。同時実行は `mkdir $MANTRA_VENDOR/pstack/.lock` で防ぐ。
   - `current` の差し替えは `ln -sfn` を使う（`mv -f` は、リンク先がディレクトリだとその中に入ってしまう）。
2. **スキルのリンク**:
   - 退避先は `~/.claude/skills` の外、`~/.claude/skills.bak/<名前>.bak-<TS>` にする（中に置くと、SKILL.md が二重に読まれるおそれがある）。
   - 同じ名前で live clone 以外を指すシンボリックリンクがあれば、張り替えずに警告し、install を非 0 で終える。
   - `~/.claude/skills` が無ければ先に作る。
3. **フィクスチャ**: `tests/verify.test.sh` の `mk_fixture` と `tests/deploy.test.sh` の使い捨て origin に、`skills` と `pstack/PIN` を加える。g と h は、`skills/` や `pstack/PIN` が無ければ FAIL にし、それを負例のテストにする。
4. **FM-VERSION**:
   - vendor の `current` があるときだけ動くテストで、`nil-mode` が名指しする pstack のパスと `principle-*` が実在するかを確かめる。
   - `rules/pstack-models.md` の役割名が、`<pstack>/skills/setup-pstack/SKILL.md` の役割に含まれるかも確かめる。
   - install の警告では、`current` のリンク先の SHA と PIN を照合する。
   - deploy の前に、`scripts/pstack.sh` を一度、本物の GitHub に対して実行して記録する。
5. **テストの密閉**:
   - `tests/pstack.test.sh` は、冒頭で `GIT_DIR` などを unset し、`GIT_CONFIG_GLOBAL=/dev/null` にする。`HOME`・`MANTRA_VENDOR`・`MANTRA_PSTACK_REPO` は一時ディレクトリに固定する。
   - install のテストは `env -u MANTRA_VENDOR` で呼ぶ。
   - `scripts/pstack.sh` も、冒頭で他のスクリプトと同じ unset をする。
6. **install の警告**: pstack の警告は `echo` だけにする。`act` を使うと、2 回目の「no changes needed」が崩れる。
7. **番兵**: 番兵の文言は delegation.md の Plans 節（`see \`rules/pstack-models.md\` and the Models line above`）と同じコミットで変える。

## 対抗レビューの扱い

critic 29 回の仕分け（scratchpad の critic-audit-A/B/C.md）による。High・Medium の指摘 297 件のうち、本物 228、推測 66、外れ 3。影響が大きく、親が気づいていなかった本物の指摘が 47 件で、29 回中 24 回に出ている。判定は 29 回とも「変更つきで可」系だった。28 回が opus で動いていた。結論として、計画への mob-critic は残し、既定は sonnet、判定ではなく指摘を確かめて採る。揉めている diff には pstack の `interrogate` を足す。詳細は `skills/nil-mode/SKILL.md` の「対抗レビュー」節。

## mantra のルールと pstack の突き合わせ

| mantra | pstack | 扱い | 理由 |
|---|---|---|---|
| FM-PLAUSIBLE | principle-prove-it-works | 残す | pstack は nil-mode を読んだときしか効かない。確認不足の断言は、採掘で 2 件見つかっている |
| FM-TEST-FIX | principle-test-behavior-not-implementation、principle-fix-root-causes | 残す | 「テストの期待値を変えない」は pstack に無い |
| FM-CODE-SCOPE | principle-laziness-protocol（差分を最小に） | 残す | 範囲外の変更への苦情は 0 件。効いているのか不要なのかは区別できないので、11-12 の測定で見る |
| FM-GIT-NOVERIFY | 無し | 残す | pstack に無い。サブエージェントが hook で止まって迂回しなかった実例がある |
| FM-VERSION | 無し | 残す（番兵） | pstack に無い |
| FM-AGENT-CRITIC | interrogate（実行で証明する別物） | 残す（番兵） | critic の仕分けで有用と出た |
| delegation「計画を見せて OK を待つ」 | principle-never-block-on-the-human | 高リスクのときだけに縮める | 「止まるな」が 15 回前後、一言の承認が 10 回以上 |
| delegation の Roster 表 | 無し | 消す | Agent ツールの一覧に同じ説明が出る |
| performance.md | poteto-mode の Subagents 節、setup-pstack | delegation の Models 行と pstack-models.md に統合 | pstack の既定（grok、opus xhigh）はこの環境では全部 Opus になる |
| git-workflow「UI はスクショ」 | control-ui（未導入） | 「実環境で確認」に変える | スクショの要求は全期間で 0 件。ユーザーは実機で確かめる |
| git-workflow「マージは承認」 | Shipping は自分でマージする | 範囲つき許可を明記し、nil-mode で Shipping を縛る | 包括許可が毎セッションのように出ている |
| （無し） | 無し | git-workflow に「日本語で書く」を足す | 英語で出して 6 回言い直されている |
| guard.sh | 無し | 残す | pstack に安全装置は無い |

## 11-12 の測定との関係

このブランチは 11-12 の P5 測定が終わるまで deploy しない。測定の対象（自発的なレビュー役の起動、安いモデルへの言い直し、常時読み込みの行数）を、切り替え前の状態で取るため。deploy 後は 12-10 の測定が、pstack 層の効果も含めた値になる。

## 振り分けの評価

`nil-mode` を読ませた新しい sonnet エージェントに、実際の依頼に近い 12 件を判定させる。正解は `tests/fixtures/nil-mode-routing.json` に先に書いておき、エージェントには見せない。プレイブックと「始める前に止めるか」の両方が一致した件数が 10 件以上なら合格。

- 2026-11-04 1 回目: 11/12 で合格。外れは 3（Fx0 の実機バグ）。「実機は手順を渡す」と Bug fix の「自分で再現する」がぶつかり、始める前に止めていた。直したのは nil-mode のほうで、「止めるのは操作の直前だけ」「実機は読み取りまで自分で」「ライブ設定はリポジトリの編集を含まない」「あいまいな許可は厳しいほうに読む」を足した。
- 2026-11-04 2 回目（直した後の最終版、別の新しいエージェント）: 12/12。残った迷いは、評価の問いの「始める前に止めるか」が、見積もりや列挙といった前処理を含むかどうかで、nil-mode の文面ではなかった。次に評価を作るときは、問いを「承認を求める最初の時点はどこか」にする。
- 再実行: 答えを JSON（`{"answers":[{"id","playbook","stop"}]}`）で書かせ、正解表と機械的に突き合わせる。

## PIN の上げ方

1. 新しい SHA が `cursor/plugins` の main の履歴上にあることを確かめる。GitHub は fork のコミットも親の URL から SHA で取れるため。`gh api repos/cursor/plugins/compare/<新SHA>...main --jq '{status,behind_by}'` で `behind_by` が 0 なら履歴上にある。fd268b8 は 2026-11-04 に確認済み（ahead 2、behind 0）。
2. 旧 SHA との差分（`git diff <旧>..<新> -- harness/pstack/claude-code`）を読み、許可の確認を飛ばす指示や、新しいスクリプトの実行が増えていないか見る。
3. `pstack/PIN` の `commit` と `version` を変え、`scripts/pstack.sh` で取得し、`bash scripts/verify.sh` の i（vendor の照合）が通ることを確かめる。
4. 振り分けの評価をやり直す。

## deploy の手順（11-12 の測定のあと、ユーザーが行う）

1. `~/.claude/skills/deepen-request` は、`../../.agents/skills/deepen-request` へのリンクになっている（2026-11-04 確認）。リンク先は mantra 版より古い（出典リンクと「Rawest source」の補足が無い）。リンクを外す。
   ```bash
   trash ~/.claude/skills/deepen-request
   ```
   外さないと、install.sh は衝突を検出して何も変えずに exit 1 で止まり、deploy もロールバックされる。
2. pstack を取得する。
   ```bash
   ~/src/mantra/scripts/pstack.sh
   ```
3. 確認だけをする。
   ```bash
   ~/src/mantra/scripts/deploy.sh --dry-run
   ```
4. 反映する。
   ```bash
   ~/src/mantra/scripts/deploy.sh
   ```
5. 新しいセッションで `/nil-mode` を読ませて、`<pstack>` が解決できること、`~/.claude/skills.bak/` に退避物が無いことを確かめる。

本物の GitHub に対する `scripts/pstack.sh` の取得は、2026-11-04 に scratchpad の vendor で 2 回確かめた。初回は取得、2 回目は no changes needed で、取得したツリーに対する verify の vendor 照合は 22 件すべて一致した（nil-mode に `no-comments` の参照を足したあとは 23 件）。
