# mantra モダナイゼーション計画（2026-10-15）

Status: **承認待ち（ドラフト v2。mob-critic のレビューを反映済み）**。承認後はこのファイルを実装の SSOT とする。決定事項（D 番号）を変えるときは、先にこのファイルを更新する。

## 目的

- mantra を Claude Code の現行機能に合わせ、標準機能で代わりがきく自前の仕組みを減らす。前提とするバージョンは、手元が 2.1.287、公式ドキュメントが 2.1.300 時点。
- Codex 連携を撤去する。Codex は使っていない。GPT 契約がなく、手元の Codex.app は古くてマルウェア扱いされている。
- 毎セッション常に読み込まれるルールを減らす。現在は rules/ が 12 ファイル、1,159 行、約 40KB で、およそ 1 万トークンになる。
- 2026-10-15 に追加した 2 つのルールは、文言を変えずに残す。
  - FM-VERSION
  - `rules/agents.md` の段落「サブエージェントを使う計画ではオーケストレーション、モデル、検証ゲートを明記する」

## 前提と制約

- `~/.claude/rules` は `~/src/mantra/rules` へのシンボリックリンクになっている。そのため、メインの checkout のブランチと作業ツリーが、そのまま全セッションのルールになる。この構造を、以下では「checkout = ライブ」と呼ぶ。
  - 作業はすべて worktree（`.maw-workspaces/<name>`）で行う。
  - メインの checkout は、各フェーズの「反映」ステップでだけ `git pull --ff-only` する。
- 既存のフック `hooks/p-judge.sh` は、`feat/p-judge-hook`（PR #62、未マージ）にしか存在しない。
- main ブランチに保護設定はない（`gh api .../protection` が 404 を返す）。`auto-merge.yml` は、risk:low の PR を AI レビューが通った時点でマージする。`**/*.md` は risk:low に分類される。そのため、P0 で自動マージを止めるまでは、人の承認ゲートを素通りする経路が残っている。
- 次の 2 つは、P2 の反映が終わるまで、どの checkout でも実行しない。`setup-merge.ts:78` が `~/.mantra/generated/agents` を `rmSync` で消してしまうため。
  - `npm run setup`、`npm run onboarding*`、`npm run sync:*`
  - `setup-args.ts` は未知のフラグを黙って無視するので、`--dry-run` を付けても実際に走る。
- 各 worktree では、最初に `npm ci` を実行する。これを実行しないと `.husky/_` が作られず、git hooks が動かない（確認済み）。
- Agent ツールに `name` を渡さない。Teams フラグが有効な環境で `name` を渡すと、サブエージェントが teammate として起動してしまう（O5）。

## 現状の観察（2026-10-15 に検証済み）

| # | 観察 | 根拠 |
|---|---|---|
| O1 | Claude Code は `~/.claude/rules/**/*.md` を自動で読み込む。サブディレクトリも読み、シンボリックリンクにも対応している。`paths:` frontmatter を付けると、該当ファイルに触れたときだけ読み込まれる。1 ファイル 200 行未満が推奨。このため、CLAUDE.md の「ルール参照」節は内容が重複している。 | docs: memory。12 ファイルがすべて読み込まれていることをセッション内で確認 |
| O2 | `~/.claude/agents` は `~/.mantra/generated/agents` へのリンクで、中身は次の 3 つが混ざっている。setup を実行すると、これらは消える。<br>(a) setup が生成したファイル<br>(b) 3/24 に手で入れたパッチ。7 エージェントに browser-use の tools と「Visual Capabilities」節を追加しており、git には入っていない<br>(c) mantra 由来ではない `web-search-agent.md` と `web-search-modules/`<br>ディレクトリ直下にシンボリックリンクは 0 件で、すべて実ファイル。 | `setup-merge.ts:78`、`find -type l` |
| O3 | `sync:claude` は、シンボリックリンク越しに生成先とリポジトリの rules/ 自体に書き込んでいる。テストはなく、README の説明も誤っている。 | 棚卸し §4.8 |
| O4 | Codex に関する現状は次のとおり。<br>- Codex は PATH にないため、codex MCP は ENOENT で失敗する。<br>- `~/.claude/settings.json` の `codex review` フックは、エラーを出さずに失敗している。<br>- `sync:codex` の出力は 3 月から更新されていない。<br>- Codex への参照が 28 ファイルに残っている。<br>- CLAUDE.md とメモリは、今も「コード生成は Codex に委譲する」と指示している。 | `which codex`、`git grep -i codex` |
| O5 | Agent Teams は現在も experimental で、環境変数フラグが必要。<br>- `TeamCreate`/`TeamDelete` は公式ドキュメントに存在しない。<br>- フラグが有効な状態で `name` 付きのサブエージェントを起動すると、teammate として起動する。<br>- `rules/teams.md` は、存在しないツールを前提に書かれている。 | docs: agent-teams、tools-reference |
| O6 | フック出力の書き方に古いものが残っている。<br>- `userMessage` は公式に定義されていないフィールドで、無視される。プロジェクトの `.claude/settings.json` と `~/.claude/settings.json` の両方で使われている。<br>- PreToolUse の `{"decision":"block"}` は非推奨で、deny に読み替えられる。<br>- UserPromptSubmit の `matcher` は無視される。 | docs: hooks |
| O7 | プラグインの性質は次のとおり。<br>- agents / skills / hooks / workflows は配布できるが、rules は配布できない。<br>- プラグインのエージェント名は `mantra:planner` のように名前空間付きになり、優先度は最も低い。<br>- ディレクトリ型のマーケットプレイスからインストールしたプラグインも、キャッシュ（`~/.claude/plugins/cache/<mkt>/<plugin>/<version>`）にコピーされ、バージョンと commit SHA が固定される。<br>- そのため、プラグインを更新するには、version を上げてから `claude plugin marketplace update` → `claude plugin update` が必要になる。<br>- 一方で、hooks と skills は checkout のブランチに依存しなくなる。 | `~/.claude/plugins/installed_plugins.json`（myak 0.3.0 の installPath） |
| O8 | サブエージェントの frontmatter には、`model`（fable/opus/sonnet/haiku/inherit/ID）、`effort`、`maxTurns`、`skills`、`memory`、`isolation: worktree`、`disallowedTools`、`background`、`color` などが書ける。<br>しかし mantra のスキーマは strict ではなく、`buildAgentContent` が出力するのは 4 フィールドだけ。そのため、新しいフィールドは黙って落ちる。 | docs: sub-agents、`agent-schema.ts` |
| O9 | エージェント 14 体のうち 7 体は、everything-claude-code 由来の汎用的な定型文で、全 3,858 行のうち約 2,700 行を占める。<br>- 300 行を超えるものが 5 体あり、e2e-runner は 797 行ある。<br>- doc-updater は、存在しない `/update-codemaps` を前提にしている。 | 棚卸し §4.3 |
| O10 | PR 自動化は、作りかけのまま止まっている。<br>- ローカルレビューが実行されないため、PR #62 の status は pending のまま。<br>- md ファイルの変更は自動マージの対象になっている。<br>- レビューの起動経路が 2 つあり、二重に動く。<br>- デスクトップアプリの PR 監視（Auto-fix / Auto-merge）と `/code-review --comment` で代わりがきく。 | 棚卸し §4.2、docs: desktop、code-review |
| O11 | ルールの記述が重複している。<br>- mob の手順が 3 か所に書かれている。<br>- 委譲とモデル選択の説明が 4 か所にある。<br>- pr-automation.md は mantra 固有の内容なのに、全プロジェクトで読み込まれる。<br>- testing.md は vitest を前提にしている。<br>- rules 内の `../docs/...` という相対リンクは、シンボリックリンク越しに読むと、存在しない `~/.claude/docs` を指してしまう。 | 棚卸し §6、§7 |
| O12 | p-judge は誤検知が多い。<br>- 部分一致で判定しているため、author は auth に、rapid は api に引っかかる。<br>- 関数についての質問にも P4 を出す。<br>- サブエージェントの報告やタスク通知にも反応する。このセッションでも実際に起きた。 | 棚卸し §4.2、本セッション |
| O13 | CI は Node 20 で動いているが、Node 20 は 2026-04-30 にサポートが終了している。手元は 22.22.0。また、`test:unit` はテストファイルを列挙する形になっており、`cli-telemetry.test.ts` が実行されていない。 | `validate.yml`、`package.json:33` |
| O14 | origin/main の上で `npm ci && npm run verify` を実行し、18 ファイル 134 テストがすべて通った。 | 本計画のブランチ |

## 決定事項（承認対象）

ラベルの意味:
- **[コア]** 依頼の範囲そのもの（標準機能への置き換えと Codex 撤去）。
- **[任意]** 改善の提案。個別に承認・却下できる。
- ★ 推奨案。

| # | 論点 | 内容 |
|---|---|---|
| D1 [コア] | Codex の撤去 | ★次のものをすべて撤去する。必要になれば git の履歴から戻せる。<br>- `sync:codex` 一式と `codex-utils`<br>- `onboarding:full*`（Codex への同期専用）<br>- setup の案内文「npm run sync:codex」<br>- 関連するテストと文書<br>- 環境側の設定: codex MCP、`codex review` フック、`mcp__codex__*` の許可、`~/.claude/skills/mantra*` のリンク、CLAUDE.md とメモリにある委譲の指示 |
| D2 [コア] | 配布モデル | ★生成とマージの仕組みをやめ、Claude Code の標準の読み込みに任せる。<br>- `~/.claude/rules` は現状どおり、ディレクトリごとのリンクにする。<br>- `~/.claude/agents` は実ディレクトリに変え、その中に `mantra → <repo>/agents` というサブディレクトリのリンクを置く。mantra 以外のエージェントは、その隣に移す。<br>- 次のものを削除する: setup-merge、`~/.mantra/generated`、skill-family 一式、`validate:drift`、`sync:claude*`、`onboarding:claude`、ユーザーソース / locale の合成、metric の `user_source_count`。<br>- AIL family は 1 ファイルにまとめる。<br>- hooks と skills は、`plugin/` 配下のローカルプラグイン `mantra@mantra` で配布する。マーケットプレイスはリポジトリのルートに置く。<br>- エージェントはプラグインに入れない。O7 の名前空間の問題があるため。 |
| D2a [コア] | サブディレクトリのリンクが読まれるか | P2 の最初に実機で確かめる。読まれない場合は、エージェントごとのファイル単位のリンクに切り替える。 |
| D2b [コア] | setup の安全化 | ★次の 4 点を入れる。<br>- 未知のフラグをエラーにする。<br>- HOME が本物のときに linked worktree から実行されたら拒否する。<br>- `--dry-run` を本当に何も変更しない動作にする。<br>- mantra 以外のファイルを移動して保全する。 |
| D3 | PR 自動化 | **[コア]** P0 で `auto-merge.yml` を無効にする（`gh workflow disable`。元に戻すのは `enable`）。<br>**[任意★]** 自動化一式を退役させる。対象は `pr-review.sh`、`ai-review.yml`、`auto-merge.yml`、`risk-classifier.yml`、`risk-paths.json`、`review:pr`、pre-push で裏で走るレビュー、プロジェクトの PostToolUse フック。<br>代わりに、ready にする前に `/code-review --comment` を実行し、CI の修正はデスクトップの PR 監視に任せ、マージは人が行う。`validate.yml` は残す。<br>代案: 一式を残したうえで、rules / agents / hooks を high リスクに分類し直す。 |
| D4 | ルールの再編 | **[コア]** 次の点を直す。<br>- 古くなったツールへの言及（Codex、TeamCreate、Task、ultrathink）<br>- `teams.md` を agents.md に統合する（15 行以内）<br>- `../` 形式の相対リンク<br>- testing.md の vitest 前提を一般化する<br>- coding-style と testing に `paths:` を付ける<br>- pr-automation.md を docs へ移す<br>- hooks.md を docs へ移す<br><br>**[任意★]** 次の点も行う。<br>- mob の詳しい手順を、スキル `/mantra:mob` として必要なときだけ読み込む形にする。自動で使う前提（P3 の発動条件、役割、使い分け）は、agents.md に 20 行以内の要約として常に読み込む形で残す。<br>- patterns.md を削除する。<br>- 常に読み込む量を 18KB 以下にし、各ファイルを 200 行未満にする。 |
| D5 | エージェント | **[コア]** 次の点を行う。<br>- 名前は変えない。<br>- スキーマを strict にして、現行のフィールドを受け付ける。未知のキーはエラーにする。<br>- P0 で取り込んだ browser-use の tools は残す。<br><br>**[任意★]** 次の点も行う。<br>- 定型文の多い 7 体を 200 行以下に削る。<br>- モデルの割り当てを次のように見直す。<br>  - opus: planner / architect / replan / mob-navigator / mob-critic / code-reviewer / security-reviewer。重要な判断と品質ゲートを担うため、現状維持とする。<br>  - sonnet: tdd-guide / build-error-resolver / refactor-cleaner / doc-updater / e2e-runner / autonomous-improvement-loop / mob-scribe。実行と要約が中心なので、opus から下げる。<br>- security-reviewer から Write と Edit を外す。スキャナを実行するので、Bash は残す。 |
| D6 | settings.json にあるフック | **[コア]** 次の点を直す。<br>- 無効な出力形式（`userMessage` と `decision:block`）<br>- `codex review` フックを削除する<br>- tmux の注意喚起を削除する（実際には何も表示されていない）<br><br>**[任意★]** ハーネスとしての方針を担うフックを、プラグインに移してテストを付ける。<br>- 危険なコマンドのガードは `permissionDecision: deny` にする。<br>- console.log のチェックと HANDOVER の鮮度チェックは `systemMessage` にする。<br>- 個人用の zed フックは settings.json に残す。<br>- 移すのと同時に、settings.json 側の重複を消す。 |
| D7 [任意] | 新しいフック | SessionStart で `readlink ~/.claude/rules` からライブの checkout を割り出し、main 以外のブランチになっているか、未コミットの変更があれば `systemMessage` で警告する。 |
| D8 [コア] | Teams のフラグ | ★有効のままにする。O5 の副作用をルールに明記する。今回の作業では Teams を使わない。 |
| D9 [コア] | Node | ★Node 22 にそろえる。`engines`、`.nvmrc` に 22.22.0、CI、`ensureNodeVersion(22)`。`test:unit` をディレクトリ指定にし、vitest のカバレッジ対象を実在するファイルに合わせる。 |
| D10 [任意] | 後片付け | マージ済みの worktree `harness_2026` と、マージ済みのローカルブランチ 7 本を削除する。stash は残す。 |
| D11 | p-judge | **[コア]** ユーザー以外が送った内容には反応しないようにする。対象は agent-message、task-notification、side-sessions-event、ci-monitor-event。<br>**[任意★]** 単語境界で判定し、O12 の誤検知例を回帰テストにする。使われていない haiku バックエンドを削除する。 |
| D12 [任意] | 履歴文書 | 参照されていない `issue4-closeout-checklist.md` と `mob-release-notes.md` を削除する。 |

## 自前の仕組みと置き換え先

| いまの自前の仕組み | 置き換え先 |
|---|---|
| CLAUDE.md の「ルール参照」節 | rules の標準の自動読み込み（節を削除） |
| setup によるマージ、生成ディレクトリ、family と overlay、ユーザーソースの合成、`sync:claude` | 標準の再帰的な読み込みとシンボリックリンク（D2） |
| settings.json に直接書いた p-judge などのフック | プラグインの `hooks/hooks.json`（`${CLAUDE_PLUGIN_ROOT}` を使う） |
| 常に読み込まれる mob-programming.md（285 行） | 20 行の常時要約と、必要なときに読むスキル `/mantra:mob`（D4 任意） |
| teams.md に書かれた TeamCreate 前提の手順 | 標準の Agent Teams（experimental）について数行で説明 |
| Codex への委譲（`mcp__codex__codex`） | Claude のサブエージェントに、Agent ツールの `model` や frontmatter の `model` を指定して任せる |
| `pr-review.sh`（`claude -p`）、pending status、自動マージ | `/code-review --comment`、デスクトップの PR 監視、人によるマージ |
| `ultrathink` | effort レベル（`/effort`、frontmatter の `effort`） |
| maw による worktree の補助 | 標準の worktree（`claude -w`、EnterWorktree、`isolation: worktree`）。maw は選択肢の一つとして残す |

## 完了後のライブ構成

```
~/.claude/rules            -> ~/src/mantra/rules             (現状維持。git pull で反映)
~/.claude/agents/          実ディレクトリ
  mantra                   -> ~/src/mantra/agents            (D2a の結果によってはファイル単位のリンク)
  web-search-agent.md, web-search-modules/                   (~/.mantra/generated から移す)
plugin mantra@mantra       ~/.claude/plugins/cache/mantra/mantra/<version>  (version を上げてから update で反映)
  hooks                    p-judge / pre-tool-guard / stop-checks / session-start-guard(D7)
  skills/mob               mob と teams の手順、テンプレート、例
~/.mantra/metrics          現状維持（~/.mantra/generated は P2 の反映後に trash へ移す）
```

## フェーズ計画とオーケストレーション

```
P0 地ならし ─▶ P1 Codex撤去 ─▶ P2 配布モデル ─┬─▶ P4 エージェント ─┬─▶ P3 ルール+mob ─▶ P6 PR自動化+文書 ─▶ P7 最終確認
                                                 └─▶ P5 フック      ─┘
```

- **逐次で進めるもの**
  - P0 → P1 → P2: いずれも scripts、tests、package.json を大きく変える。P4 以降は P2 の構成を前提にする。
  - P3 は P4 と P5 の後に行う。agents.md にはロスターとモデル（P4 の結果）が載り、p-judge の助言文はラダーの文言（P3）と一致させる必要がある。plugin.json の version も P3 で上げる。
- **並列で進めるもの**: P4 ∥ P5。それぞれ別の worktree と別ブランチで進め、担当するファイルを分ける。
  - P4: `agents/`、`agent-schema.ts`、`validate-agents.ts`、agents のテスト
  - P5: `plugin/hooks/`、`.claude/settings.json`、フックのテスト
  - 共有ファイルの担当: `package.json`（lint-staged、scripts）と `vitest.config.ts` は P2 で整える。それ以降に変更が必要になったら、マージ順で後になる方が rebase して吸収する。`plugin.json` の version は P5 → P3 の順に上げる。README は、contract テストのために P1 と P2 で Scripts 表の行だけ直し、残りは P6 で直す。
- **サブエージェントの同時実行は最大 3 体**。P4 で定型文を削る作業は 2 体で並列に進め、P5 の 1 体と合わせて 3 体になる。
  - Workflow ツールは使わない。ユーザーがワークフローの利用を明示していないため。
  - Agent Teams も使わない。experimental で、tmux と teammate を管理するコストに見合わないため。
  - 実行方法は、background のサブエージェントに作業する worktree のパスを明示して渡す形にする。
- **worktree** は、各フェーズの開始時に私が `git worktree add -b <branch> .maw-workspaces/<name> origin/main && npm ci` で作る。`isolation: worktree` は、どのブランチから作るかを制御しにくいので使わない。
- **Codex が使えない**ため、コード生成は sonnet のサブエージェントに任せる。これが、今回 rules に書く新しい委譲の方針になる。

### 担当エージェントとモデル

| フェーズ | 作業 | 担当 | モデル | 理由 |
|---|---|---|---|---|
| 全体 | 計画、設計の判断、統合、差分のレビュー、PR 作成、各フェーズの反映 | メインセッション（私） | Opus 5.5 | 判断が中心で、全体の文脈を持っているのは私だけだから |
| P0 | バックアップ、自動マージの停止、ルールのコミット、パッチの取り込み、checkout の切り替え | 私が直接 | Opus 5.5 | 作業は小さいが、ライブ設定に直接触れるため |
| P1 | Codex 関連の削除（約 25 ファイル） | general-purpose | sonnet | ファイル一覧つきの機械的な削除作業 |
| P1 | レビュー | code-reviewer | sonnet（呼び出し時に指定） | 削除漏れと参照切れの確認が中心 |
| P2 | 実装前に、設計に反論してもらう | mob-critic | opus | ライブ設定を切り替えるため（FM-AGENT-CRITIC）。読み取り専用なので、差分はファイルに保存して渡す |
| P2 | setup の移行処理と、その安全装置・テスト | 私が直接 | Opus 5.5 | ライブのデータに触れるため。performance.md の「委譲すべきでない」に当たる |
| P2 | family と sync の削除、プラグインの雛形と構成テスト | general-purpose | sonnet | 仕様が決まっている削除と定型的なコード |
| P2 | レビュー | code-reviewer | opus | 設定の読み込み経路と、データが失われないかの確認 |
| P4 | strict スキーマとテスト（TDD） | tdd-guide | sonnet | 小さな TDD |
| P4 | 定型文の削減（2 グループを並列）<br>[architect, tdd-guide, refactor-cleaner, doc-updater] / [build-error-resolver, e2e-runner, security-reviewer] | general-purpose ×2 | sonnet | 量の多い編集を仕様どおりに進める作業。全差分は私が読む |
| P5 | p-judge の修正、フックのプラグイン化（TDD） | tdd-guide | sonnet | テスト可能なシェルスクリプトの作業 |
| P5 | ガードのレビュー | security-reviewer | opus | PreToolUse のガードはセキュリティ境界にあたるため |
| P3 | ルール本文の書き直し | 私が直接 | Opus 5.5 | ルールは全セッションの振る舞いを決めるので、判断が中心になる |
| P3 | mob スキルの切り出し（既存の文章の移動と圧縮） | general-purpose | sonnet | 既存の文章を組み替える作業。doc-updater は codemaps 前提の定型文が強いので使わない |
| P3 | 「削除・移動した記述」の対応表に反論してもらう | mob-critic | opus | ルールの欠落は気づきにくいため |
| P6 | PR 自動化の削除（D3 任意）と Node 22 対応 | general-purpose | sonnet | 機械的な作業 |
| P6 | CI の変更に反論してもらう | mob-critic | opus | CI の設定は高リスクのため |
| P6 | README 2 本、docs/ja、HANDOVER | general-purpose | sonnet | 文書の作業 |
| P7 | 最終確認の要約 | mob-scribe | sonnet | 人が承認する要約なので haiku にはしない |

### 共通の検証ゲート（フェーズごと）

- **G1**: worktree で `npm run verify` が通ること。scripts、tests、package.json を変えたフェーズでは、`npm run test:coverage` と `npm run smoke:onboarding` も通すこと。plugin/ を変えたフェーズでは、`claude plugin validate .` と `claude plugin validate plugin` の出力を PR に貼ること（CI には claude CLI がないため）。
- **G2**: レビュアーが挙げた CRITICAL / HIGH を 0 件にすること。フェーズごとの反論役（mob-critic）と security-reviewer の指摘も含む。
- **G3**: 私が差分全体を読み、そのフェーズの範囲外の変更がないことを確かめること（FM-CODE-SCOPE）。さらに、各サブエージェントが終わるたびに `git -C ~/src/mantra status --porcelain` を確認し、ライブの checkout が変わっていないことを確かめること。
- **G4**: PR の本文に「意図して変えた契約（contract テスト、metric、CLI の出力）の一覧」とテスト計画を書くこと。テストの変更は、すべて D 番号に結びつけること（FM-TEST-FIX）。
- **G5（反映）**: 人の承認を得てマージしたあと、次の手順を行うこと。
  1. ライブ checkout で `git fetch && git status` を実行し、HEAD が main であることを確かめる。
  2. `git pull --ff-only` を実行する。
  3. plugin/ を変えた場合は、version を上げたうえで `claude plugin marketplace update mantra && claude plugin update mantra@mantra` を実行し、`installed_plugins.json` の version と SHA を確かめる。
  4. そのフェーズに対応する settings.json / CLAUDE.md の変更を行う。項目ごとに承認を得る。
  5. 新しいセッションで確認する。`/hooks` でフックの数と出どころ、エージェントの一覧、ルールの読み込みを見る。
  - 停止スイッチは `claude plugin disable mantra@mantra`。
- 次のフェーズは、反映が終わってから `git fetch origin main` を実行して始める。

## 各フェーズの内容

### P0 地ならし
1. **バックアップ**: `~/.claude/settings.json`、`~/.claude/CLAUDE.md`、`~/.claude.json` のうち codex の定義部分、`~/.mantra/generated/agents` を、`~/.claude/backups/mantra-modernization-20261015/` に `cp -a` でコピーする。`~/.mantra/generated/agents` の直下にシンボリックリンクがないことは確認済み。
2. **自動マージを止める**: 承認を得てから `gh workflow disable auto-merge.yml` を実行する（D3 コア）。
3. **未コミットの 2 ルールをコミットする**: メインの checkout 上で、ブランチは切り替えずにコミットし、PR #62 に 1 コミットとして追加して push する。
4. **ライブにしかないパッチを取り込む**: browser-use の tools と「Visual Capabilities」節を `agents/*.md` に反映し、`chore/capture-live-agents` として別の PR にする。
5. **マージ**: 承認を得て、PR #62、4 の PR、この計画の PR（`docs/modernization-plan`）の順にマージする。
6. **checkout の切り替え**: 承認を得てから、次の順に実行する。
   - `git fetch`
   - `git diff feat/p-judge-hook origin/main -- rules hooks` の結果が空であることを確かめる
   - `git branch -f main origin/main && git switch main`
   - 新しいセッションで、p-judge と FM-VERSION が生きていることを確かめる

### P1 Codex の撤去（`feat/modernize-p1-remove-codex`）
- **削除するもの**
  - `scripts/sync-{agents,rules,templates,examples}-to-codex.ts`
  - `scripts/lib/codex-utils.ts`。`YAML_DUMP_OPTIONS` は残りの利用箇所のために移動する
  - package.json の `sync:codex*` と `onboarding:full*`
  - `--full` の処理
- **書き換えるもの**
  - setup の案内文
  - テスト: cli-json / package-scripts / setup-message / smoke
  - docs: authoring / cli-contract / troubleshooting / ops-metrics
  - README 2 本の Scripts 表と、その周辺の行
  - `rules/performance.md` と `rules/teams.md` の Codex 行は、最小限の修正にとどめる
- **触らないもの**: AIL の codex overlay と、skill-family のテスト。P2 で family ごと消すため、ここで直すと二度手間になる。
- **受け入れ条件**: G1〜G4 を満たし、`git grep -i codex` の結果が AIL family の overlay とこの計画書だけになっていること。
- **反映（G5）**: 承認を得てから次を行う。
  - settings.json から `mcp__codex__*` の許可と `codex review` フックを削除する
  - `claude mcp remove codex`
  - `~/.claude/skills/mantra*` のリンクを trash に移す
  - CLAUDE.md の Codex 委譲の記述（「実装の委譲」節と「モデル選択」節のコード生成の行）を「sonnet サブエージェント」に置き換える
  - メモリ `feedback_model_delegation_strategy.md` を更新する

### P2 配布モデルの刷新（`feat/modernize-p2-wiring`）
0. **実機で確認する（D2a）**: 一時ディレクトリに、次の 3 通りでプローブ用のエージェントを置く。
   - 実ディレクトリのサブディレクトリ
   - シンボリックリンクにしたサブディレクトリ
   - 名前に名前空間が付かないことの確認

   それぞれを `~/.claude/agents/zz-probe*` 経由で見せ、`claude -p --output-format stream-json --verbose` の init イベント（なければ実際に起動を試す）で、`subagent_type` の名前のまま見えるかを確かめる。確認が終わったら片付け、結果をこの計画書に追記する。
1. **設計への反論**: mob-critic が設計をレビューし、指摘をこの計画書に反映する。
2. **最初のコミットは安全装置にする（D2b、私が担当）**: 未知のフラグをエラーにする、worktree から実行されたら拒否する、本当に何もしない `--dry-run`、mantra 以外のファイルの保全。それぞれテストを付ける。
3. **新しい setup を作る（私が担当）**: D2 の構成を作るようにする。既存のリンクは退避してから変換し、mantra 以外のファイルは移動する。テストは、実際の構成を複製した一時 HOME で行う。
4. **削除と雛形（sonnet）**
   - AIL を 1 ファイルにまとめる。lock の文言と AIL の契約テストは維持する。
   - family / sync / drift / ユーザーソースの仕組みを削除する。
   - lint-staged から `validate:drift` を外す。
   - `test:unit` をディレクトリ指定にする。
   - vitest のカバレッジ対象を更新する。新しい setup とプラグインのコードを対象に入れる。
   - プラグインを作る: `plugin/.claude-plugin/plugin.json`（version は package.json と一致させる）、`plugin/hooks/hooks.json`、`hooks/p-judge.sh` を `plugin/hooks/` へ移す、ルートに `.claude-plugin/marketplace.json` を置く、構成テストを書く。
   - README の Scripts 表を直す。
5. **ゲート**: G1〜G4 を満たすこと。さらに、`claude -p --plugin-dir <worktree>/plugin` を使い、hooks.json の配線が動くことを smoke で確かめる（FM-TEST-PASS）。
6. **反映（G5、リハーサルしてから本番）**
   1. 一時 HOME で、本番と同じ手順を一度通す。
   2. 本番では、まず settings.json から p-judge の行を削除する。
   3. 次に `git pull` を実行する。
   4. HEAD が origin/main であることを確かめてから setup を実行する。
   5. `claude plugin marketplace add ~/src/mantra` と `claude plugin install mantra@mantra` を実行する。
   6. 新しいセッションで次を確かめる。
      - `/hooks` に、p-judge の UserPromptSubmit が 1 件だけあり、出どころがプラグインになっている
      - エージェントが 15 体見える
      - ルールが読み込まれている
   7. 問題がなければ `~/.mantra/generated` を trash に移す。戻すときはバックアップから復元する。手順は PR に書く。

### P4 エージェントの刷新（`feat/modernize-p4-agents`、P5 と並列）
- strict スキーマにして、現行のフィールドを受け付けるようにする。モデルは別名か ID で指定する。未知のキーと長すぎる description はエラーにする。それぞれテストを付ける（D5 コア）。
- D5 任意を承認した場合は、モデルの割り当てを見直し、7 体を 200 行以下に削る。役割、チェックリスト、出力形式は残し、特定の技術スタックに寄った例、存在しないコマンド、外部ツールのインストール手順は消す。e2e-runner は、手元で使えるブラウザ自動化（Playwright MCP、agent-browser スキル）を前提に書き直す。
- 反映: `git pull` を実行し、新しいセッションで planner と code-reviewer を 1 回ずつ起動して確かめる。

### P5 フックの刷新（`feat/modernize-p5-hooks`、P4 と並列）
- D11 の p-judge の修正を、テストファーストで行う。
- D6 任意を承認した場合は、`pre-tool-guard.sh`（`permissionDecision` を返す）と `stop-checks.sh`（`systemMessage` を返す）を作り、契約テストを付ける。
  - 異常があっても exit 0 で終わること、タイムアウトしたときは遮断しないことを仕様として書く。
  - D7 を承認した場合は `session-start-guard.sh` も作る。
- プロジェクトの `.claude/settings.json` から、prettier、tsc、console.log、PR レビューのフックを削除する。
- `plugin.json` の version を上げる。
- 反映: プラグインを更新するのと同時に、settings.json から、移した分の重複と tmux の注意喚起を削除する。zed のフックは出力形式だけ直す。

### P3 ルールの再編と mob スキル（`feat/modernize-p3-rules`）
- ファイルごとの処置は次のとおり。

| ファイル | 処置 | 読み込み |
|---|---|---|
| failure-modes.md | 維持する（FM-VERSION を含む）。古いツールへの言及だけ直す | 常時 |
| agents.md | 書き直す。<br>- ロスター（AIL を含む）<br>- P0〜P4<br>- Plan/Execute の分離（新しく追加した段落は文言を変えない）<br>- mob の要約（20 行以内）<br>- Teams / Workflow / サブエージェントの使い分け（15 行以内。O5 の副作用も書く） | 常時 |
| performance.md | 書き直す。<br>- Codex を外す<br>- モデルの別名と effort<br>- frontmatter での指定<br>- Workflow は明示的に頼まれたときだけ使う | 常時 |
| git-workflow.md | PR は `/code-review` を通してから ready にし、マージは人が行う | 常時 |
| security.md | 維持する。重複を整理する | 常時 |
| testing.md | 一般化する | `paths:` コード・テスト |
| coding-style.md | 維持する。軽く整理する | `paths:` コード |
| mob-programming.md | D4 任意を承認した場合は `plugin/skills/mob/` へ移す。テンプレート、例、役割の境界の説明（ja と en の stub）、MOB_QUICKSTART も一緒に移す | 必要なときだけ |
| teams.md | agents.md に統合し、削除する | — |
| hooks.md | `docs/ja/harness-engineering.md` へ移し、削除する | — |
| pr-automation.md | `docs/ja/pr-automation.md` へ移す。D3 任意を承認した場合は削除する | — |
| patterns.md | D4 任意を承認した場合は削除する | — |

- `../docs/...` という相対リンクは、「mantra リポジトリの docs/ja/...」という表記に変える。
- p-judge の助言文を、新しいラダーの文言に合わせる。`plugin.json` の version を上げる。
- `rule-parser` と `validate-rules` を、frontmatter の `paths:` に対応させる。
- ルール内容の契約テストを新しく作る。確かめる内容は次のとおり。
  - FM-VERSION の見出しが存在すること
  - 「Do not leave model assignment implicit.」が存在すること
  - `../` 形式のリンクがないこと
  - D4 任意を承認した場合は、常に読み込まれる分（再帰的に数え、`paths:` 付きは除く）が 18KB 以下であること
- PR には「削除・移動した記述 → 移動先」の対応表を付け、mob-critic とユーザーに確認してもらう。
- 反映: `git pull`、プラグインの更新、CLAUDE.md の「ルール参照」節の削除（承認を得る）、新しいセッションで `/mantra:mob` とルールが読み込まれていることを確かめる。

### P6 PR 自動化と文書（`feat/modernize-p6-pr-docs`）
- D3 任意を承認した場合は、自動化一式を削除し、pre-push は `npm run verify` だけにする。承認しなかった場合は、`auto-merge.yml` を有効に戻すかどうかを決める。
- D9 の Node 22 対応を行う。
- 文書を更新する。
  - README 2 本: 契約で決まっている見出しは維持する。clone 先は任意だが、setup した checkout がそのままライブになることを書く。
  - harness-engineering.md: 標準の worktree とプラグインについて書く。
  - authoring.md: frontmatter、プラグイン、スキルの書き方。
  - cli-contract / ops-metrics / troubleshooting。
  - templates/repo-* のリンクを直す。テンプレート自体は維持する。
  - AIL の例（examples/ja）は維持する。
  - D12 を承認した場合は、該当する文書を削除する。
  - HANDOVER.md を書き直す。
- 反映: `git pull`、`gh workflow` の状態を確かめる。

### P7 最終確認と後片付け
- D10 を承認した場合は、後片付けを行う。この計画の worktree も削除する。
- 新しいセッションで、エージェント、ルール、スキル、フック、設定が計画どおりになっているかを確かめる。mob-scribe（sonnet）に要約させ、HANDOVER に記録する。

## リスク

| リスク | 重大度 | 対策 |
|---|---|---|
| setup を実行して、ライブのエージェントが消える | High | P0 でバックアップを最初に取る。P2 の反映までは setup を実行しない。D2b の安全装置を入れる。一時 HOME でリハーサルする |
| 反映の途中で、ライブ設定が壊れたり二重になったりする | High | フェーズごとに G5 を行う。先に settings.json の行を削除してからプラグインを入れる。`/hooks` で確かめる。停止スイッチ。バックアップから戻す |
| 自動マージで人の承認ゲートが抜かれる | Medium | P0 で `auto-merge.yml` を無効にする |
| サブディレクトリのリンクが読まれない | Medium | D2a で実機確認し、だめならファイル単位のリンクに切り替える |
| プラグインの更新を忘れて、スキルやフックが古いまま残る | Medium | G5 に version を上げる手順と、`installed_plugins.json` の確認を入れる |
| contract テストの変更で、後退が隠れる | Medium | G4 |
| ルールを削って、頼っていた振る舞いが消える | Medium | 対応表を作り、mob-critic とユーザーに確認してもらう。mob の要約は常に読み込む形で残す |
| サブエージェントが誤ってライブの checkout を編集する | Medium | G3 で `git -C ~/src/mantra status` を確認する |
| checkout = ライブという構造そのものが残る | Low | 運用ルールと D7。将来の案として、ライブ専用の checkout を用意する |
| 手元の Claude Code（2.1.287）がドキュメント（2.1.300）より古い | Low | 2.1.288 以降の機能（`onFailure` など）には依存しない |

## スコープ外

- myak の変更
- `~/.codex` の中身。Codex.app の削除はユーザーが行う。
- metrics の仕様変更。ただし、`user_source_count` を外すことは除く。
- 新しいエージェントの追加
- 保存済みワークフロー（mob を Workflow 化する案）。今回の作業がすべて終わってから改めて検討する。
