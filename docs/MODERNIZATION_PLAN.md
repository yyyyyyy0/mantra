# mantra 再評価と再設計計画（2026-10-15）

Status: **承認済み（案 A′、2026-10-15）・実施中**。経過は末尾の §11 実施記録を参照。

v2（commit `c936392`）は、仕組みを残したまま最新化する計画だった。v3 以降はそこから方針を変え、次の 3 点を確かめたうえで計画を作り直している。

- mantra の本来の意図が、いまも有用か
- 実際に意図どおりに効いているか
- 世界の動向に照らして古くなっていないか

承認後は、このファイルを実装の唯一の正本（SSOT）とする。

## 1. 結論

- **意図はいまも有用だが、手段の大半は古い。**
  - 意図とは「毎回言わなくても、Claude が自分の流儀（委譲とコスト、計画の透明性、検証、スコープを守ること）で仕事をする」こと。これは今でも妥当。
  - 一方、それを実現する手段の大部分は、使われていないか、効果が確認できないか、標準機能で置き換えられる。
- **推奨は案 A′「mantra を小さく作り直す」。** 次の 4 つだけを持つ、依存パッケージなしのリポジトリにする。
  - ≤200 行のルール
  - エージェント 4 体（planner と、レビュー役 3 体）
  - バージョン管理されたガードフック
  - ライブ用の clone を作るインストールスクリプト
- **比較対象は案 B′「dotfiles に統合して mantra はアーカイブ」。** どちらにするかは、ユーザーに決めてもらいたい（§5）。
- 2026 年の動向もこの方向を支持している。
  - 有効とされているのは仕組みのほう: hooks、薄いリポジトリ規約、検証コマンド、まっさらな文脈で見るレビュー役。
  - 有害とされているのは量のほう: 常時読み込む長文、役柄だけのエージェント群、キーワード判定でエージェント起動を促す仕組み。モデルの世代が上がるたびに削るのが標準になっている。

## 2. 本来の意図（履歴から再構成）

| # | 意図 | いつ、何として作られたか |
|---|---|---|
| I1 | 自分の基準で仕事をさせ、品質の底を上げる | 2026-02: everything-claude-code 系のルールとエージェントを取り込み |
| I2 | 毎回言わなくても、適切にエージェントを使う | 03-20 と 03-23 の不満（「都度言わないと使ってくれない」）から、P0〜P4 ラダー（03-17）を作り、07-06 に p-judge フックで強制 |
| I3 | 危険な判断の質を上げる | 02-25: mob（navigator / critic / scribe）、03-01: replan |
| I4 | コストを抑える | 04-09: 委譲基準（計画は Opus、コードは Codex、調査は sonnet） |
| I5 | LLM の手抜きを防ぐ | 04-02: Named Failure Modes（FM-xxx） |
| I6 | 既存リポジトリを安全に少しずつ良くする | 03-22: 「bounded repo improvement harness」に再定義（AIL と、リポジトリごとのハーネス） |
| I7 | Claude / Codex のどちらでも、どのマシンでも同じ設定を使う | 02-24 以降: setup / sync / family / ユーザーソース |
| I8 | PR を安全に自動マージする | 03-23: risk 分類、ローカル AI レビュー、自動マージ |

背景にある方針（7 月の「AI 活用改善計画」より）は 3 つある。最優先は自分の製品を出荷すること。新しく作る前に、既製品を試すこと。AI を盛り込みすぎないこと（「AI 乗っけ過ぎ病への免疫」）。

## 3. 実際に効いているか（使用実績）

調べられた範囲には限りがある。transcript は 30 日分しか残っておらず、実質的なセッションは 8 件だった。それより前は、myak・metrics・各リポジトリ・`/insights` で補った。詳細は共有ノートの `mantra-usage-evidence.md` にある。主要な数字は、私が transcript から数え直して一致を確かめた。

| 意図 | 観察 | 判定 |
|---|---|---|
| I1 ルール | rules は全セッションで約 40KB 読み込まれている。FM-ID の引用は 3 件あり、そのうち因果を追えたのは 1 件だけ。FM-AGENT-CRITIC を読んだ planner が mob-critic を呼び、critic の指摘で設計が変わった。`/insights` の主な不満（バージョンの取り違え、頼んでいない範囲の変更）は、これに対応する規則がなかったか、適用されたか判断が微妙な例だった | **効果は未証明**。失敗したとまでは言えない |
| I1 エージェント | 15 体のうち、起動されたのは 4 体（code-reviewer 10 回、security-reviewer 4、planner 2、mob-critic 1）。残り 10 体は 0 回。レビュー役の結果 11 件のうち 6 件が重要度の高い問題を見つけた | **レビュー役と planner は有用** |
| I2 p-judge | 注入は 63 件。そのうち 73% は、人の入力ではなくサブエージェントの報告や通知に反応していた。人の入力に対して推奨どおりの起動が起きた割合は、P1→planner が 0/8、P4→code-reviewer が 4/10。人の入力への注入 15 件のうち 8 件は、推奨が不適切だった | **効いていない。ノイズになっている** |
| I2 ラダー（文章） | myak の作業では、hook の指示がない最初の依頼から planner → 実装 → レビューを自発的に行った。ただし 10-13 には、ユーザーが「安いモデルに委譲して」と言い直している | **効いている唯一の仕組み** |
| I3 mob | flash / plan / review-mob の実施は 0 件。navigator と scribe も 0 回。critic は 1 回で有効だった（sonnet で実行） | critic だけ有用 |
| I4 委譲 | Codex 委譲は 4 月から 0 件。sonnet 指定は 42 件中 35 件だが、多くはユーザーに言われてからだった。エージェント定義の 15 体中 13 体は `model: opus` で、指定なしで呼ぶと Opus で動く | 半分だけ効いている |
| I6 AIL | 実際に動かした記録は 1 度もない | 未使用 |
| I6 リポジトリ用ハーネス | pre-push と verify を持つリポジトリは 4 つあるが、そのうち 2 つは mantra より前からあった。03-17 以降にテンプレートを採用したリポジトリは 0。Obsidian の ledger は使用実績なし | mantra 経由では広まっていない |
| I7 配布 | onboarding は 4/4 回、setup は 8/10 回失敗している。生成物は、手で当てたパッチとずれている | 費用に見合っていない |
| I8 PR 自動化 | ローカルのレビューが動かず、PR #62 は pending のまま止まっている | 停止している |

**組み込みエージェントとルールの関係（実機で確認済み）**: 組み込みの Plan と Explore は `~/.claude/rules` を読み込まない。自作のエージェントと general-purpose は読み込む。したがって planner を組み込みの Plan に置き換えると、計画を立てる段階で自分のルールが効かなくなる。

**基準値（P5 の比較用に今記録しておく）**
- コードを変更したセッションのうち、レビュー役が起動したもの: 5 件中 3 件（60%）
- 「サブエージェントや安いモデルを使って」という言い直し: 約月 1 回（最近では 10-13）
- 計画の差し戻し: 07-09 に 1 件

## 4. 世界の動向との照合（2026-10 時点）

出典の全体は共有ノートの `harness-trends-2026.md` にある。★の付いたものは私が原文を確認した。

- **常に読み込む指示ファイルは、効果が薄くコストがかかる。**
  - ★ ETH の研究（arXiv 2602.11988、v3 2026-09-29）: リポジトリの文脈ファイルは成功率を全体として上げず、推論コストを平均 20% 以上増やす。
  - ★ Claude Code の公式ベストプラクティス:
    - 各行について「消すとミスが起きるか？」を問う。
    - 放っておいても正しくやれることは、消すか hook にする。
    - 肥大化したファイルは、肝心の指示まで無視させる。
    - 検証にはまっさらな文脈のレビューを使い、手段として `/code-review` を挙げている。
- **モデルが上がったら足場を削る。**
  - ★ Fable 5 ガイドより:
    - 旧モデル向けに書いたスキルは指示が細かすぎて、品質を下げることがある。見直して削除を検討する。
    - まっさらな文脈で検証させるサブエージェントは、自己批判より成果がよい。
    - 現行モデルはサブエージェントを自発的に並列で使う。
- **役柄（ペルソナ）を与えても精度は上がらない**（Wharton、2025-12）。サブエージェントの価値は、文脈の分離、ツールの制限、安いモデルを使えること、まっさらな文脈で見るレビューにある。
- **複数エージェントの議論の効果は限定的。** 実行の証拠に基づく critic は効く。素朴な議論は誤った合意を生み、トークンを約 4.5 倍使う（2026-08）。
- **標準化が進んだ。** AGENTS.md と SKILL.md はツールをまたいで共通化された。ツールごとの同期スクリプトは不要になった。
- **最も強く支持されている部分。** 薄いリポジトリ規約、検証コマンド 1 本、hooks と CI による強制、人がマージすること。

| mantra の考え方 | 2026 年の評価 |
|---|---|
| 約 1 万トークンの常時ルール | 有害。推測できない個人の流儀だけに絞れば有効 |
| FM 一覧 | 有効。ただし起動条件として働くもの（FM-AGENT-CRITIC）と、再発しているものに絞る。機械的に強制できるものは hook にする |
| 役柄だけのエージェント 9 体 | 古い。残すなら 3〜4 体 |
| P0〜P4 ラダー（文章） | 短く書き直せば有効（効果の確認できた唯一の仕組み） |
| キーワード判定のプロンプト hook | 古い（不正確で、文章を注入するだけでは弱い） |
| mob の navigator / scribe | 古い。critic は、まっさらな文脈で見るレビューとして有効 |
| モデルの使い分け | 有効だが、標準機能（frontmatter の `model`、effort）で実現できる |
| AIL | 有効だが、標準機能（`/goal`、`/loop`）で実現できる |
| リポジトリ用ハーネス | 最も支持されている |
| hooks による強制 | 有効 |
| Codex との同期 | 古い |
| ローカル AI レビューと自動マージ | 標準機能で置き換えられる |

## 5. 選択肢（ユーザーに選んでほしい）

| 案 | 内容 | 長所 | 短所 |
|---|---|---|---|
| **A′ 縮小して作り直す（推奨）** | mantra を「rules（≤200 行）、agents（4 体）、hooks（ガード）、install / deploy / verify のシェルスクリプト」だけの、依存パッケージなしのリポジトリにする。ライブ設定は専用の clone（`~/.mantra/live`、main 固定）から張る | <ul><li>mantra の名前と履歴、CI による検査を保てる</li><li>開発用の checkout のブランチが、ライブ設定に影響しなくなる</li><li>保守する TypeScript が、約 5,000 行から 0 行になる</li></ul> | 一度、大きな削除 PR が必要 |
| B′ dotfiles に統合する | rules / agents / hooks を `~/src/dotfiles` に `claude/` として移し、既存の bootstrap の流れで配る。mantra はアーカイブする | <ul><li>仕組みが 1 つ減る（既にあるものを使う）</li><li>複数マシンへの配布も、既存の手順に乗る</li></ul> | <ul><li>mantra という公開リポジトリと、その検査（行数の上限など）がなくなる</li><li>dotfiles 側に検査を足す必要がある</li></ul> |
| C v2 の計画 | 仕組みを残したまま最新化する | — | 使われていない仕組みに工数をかけることになり、証拠と逆行する |

以下は A′ を前提に書く。B′ を選んだ場合も、P1（ルール）と P2 のうちエージェント・フックの中身は同じで、置き場所と配布方法だけが変わる。

## 6. A′ の目標像

### 残すもの

**rules/**（常時読み込みは合計 200 行以下、8KB 以下）
- `delegation.md`
  - 旧 `agents.md` をこの名前に改める。macOS の大文字小文字を区別しないファイルシステムでは、`agents.md` が AGENTS.md として誤って注入されることが確認されたため。
  - 「頼まれなくても行うこと」を 8 行程度で書き、存在をテストする。内容は次の 4 つ。
    - 非自明なコード変更のあとは code-reviewer を使う。
    - 認証・秘密情報・マイグレーション・データ整合性に関わる変更では、security-reviewer と mob-critic を使う。
    - サブエージェントは、理由がない限り sonnet で動かす。
    - 計画には、オーケストレーション・モデル・検証ゲートを書く（既存の段落を文言どおり残す）。
- `performance.md`: モデルと effort の選び方。Codex は削除する。
- `failure-modes.md`
  - FM-VERSION と FM-AGENT-CRITIC は文言どおり残す。
  - そのほかは、実際に再発しているものと、起動条件として働くものだけを残す。
- `git-workflow.md`: 個人の作業手順。main を fetch してから着手する、worktree を使う、検証の証拠を見せる、UI はスクショを撮る、rm ではなく trash を使う、など。
- 書き方は、各行について「消すとミスが起きるか」を問い、推測できることは書かない。

**agents/**（4 体、各 80 行以下。名前は記録やメモリとのつながりのため据え置く）

| エージェント | model | 理由 |
|---|---|---|
| planner | opus | ユーザーの方針「計画は Opus」に従う。組み込みの Plan はルールを読まないため、自作で残す。出力には、フェーズ・並列か逐次か・モデル・ゲートと、高リスクなら mob-critic を呼ぶべきという指摘を含める |
| code-reviewer | sonnet | 実績のある有用なレビュー役 |
| security-reviewer | sonnet（重要なときは呼び出し時に opus を理由つきで指定） | 実績あり。Write / Edit を外して読み取り専用にする |
| mob-critic | sonnet（同上） | 設計を変えた唯一の critic 実行は sonnet だった |

- 手で当てた browser-use のツールと「Visual Capabilities」節は削除する。使用実績が 0 回で、スクショはメインセッション側で撮るため。

**hooks/guard.sh**（バージョン管理し、テストを付ける）
- settings.json にある危険コマンドのガードを移す。
- `--no-verify` も遮断する（FM-GIT-NOVERIFY を hook として強制する）。
- 出力は `permissionDecision: deny` にする。
- settings.json からは `~/.mantra/live/hooks/guard.sh` を呼ぶ。

**scripts/**（依存パッケージなし）
- `install.sh`（冪等）
  - `~/.claude/rules` を `~/.mantra/live/rules` へのリンクにする。
  - `~/.claude/agents/` は実ディレクトリにし、4 体をファイル単位でリンクする。
  - 既存の `~/.claude/agents` は退避し、mantra 以外のファイル（web-search-agent など）を移す。
  - 本物の HOME に対しては、`~/.mantra/live` 以外から実行されたら拒否する。
- `deploy.sh`
  - 中身は `git -C ~/.mantra/live fetch && checkout --detach origin/main && install.sh`。
  - 開発は `~/src/mantra` で自由に行え、反映は deploy.sh を実行したときだけになる。
- `verify.sh` が検査する項目:
  - ルールの行数とバイト数の上限
  - 文言どおり残す 3 項目（FM-VERSION、FM-AGENT-CRITIC、オーケストレーションの段落）と、「頼まれなくても行うこと」の節が存在すること
  - エージェントの frontmatter（name、description、model が明示されていること。未知のキーは警告にとどめる）
  - `../` 形式の相対リンクがないこと
  - guard.sh のテストケース
  - install.sh を一時 HOME で実行するテスト
- `package.json` は `"verify": "bash scripts/verify.sh"` だけにする。これで `npm run verify` は引き続き使える。
- CI は `validate.yml` で verify.sh を実行する。

**templates/**: `repo-agents-pointer.md` と `repo-pre-push.example.sh` を残し、短い docs を付ける。

### 退役させるもの（タグ `pre-redesign` と git の履歴から戻せる）
- エージェント 11 体: architect、replan、tdd-guide、build-error-resolver、e2e-runner、refactor-cleaner、doc-updater、mob-navigator、mob-scribe、autonomous-improvement-loop、family 一式。代わりは、組み込みの Explore / general-purpose、`/code-review`、`/goal`、`/loop`。
- p-judge フックと PR #62。
- TypeScript 一式: setup / onboarding / sync（Claude と Codex）/ merge / family / ユーザーソース / metrics / テレメトリ / validate-drift と、それぞれの contract テスト、vitest、eslint、tsconfig、node_modules。
- Codex 関連のすべて。
- PR 自動化一式: `pr-review.sh`、`ai-review.yml`、`auto-merge.yml`、`risk-classifier.yml`、`risk-paths.json`、プロジェクトの `.claude/settings.json` のフック。
- ルール: mob-programming、teams、hooks、pr-automation、patterns、coding-style、security、testing。必要な行は、残す 4 ファイルへ移す。
- 文書と例: mob 関連の文書・テンプレート・例、AIL の例、MOB_QUICKSTART、`repo-obsidian-ledger`、docs/ja の CLI 契約・metrics・トラブルシュート・履歴文書。

### 環境側（項目ごとに承認を得る）
- `~/.claude/settings.json`
  - 削除: p-judge、`codex review`、表示されない `userMessage` のフック（tmux 案内、HANDOVER 催促）、`mcp__codex__*` の許可。
  - 移行: 危険コマンドのガードを guard.sh に移す。
  - 残す: zed を起動するフック（起動は実際に効いている）。出力の形式だけ直す。
  - 追加: `cleanupPeriodDays`（例: 120）。効果測定のために transcript を残す。
- `claude mcp remove codex`
- `~/.claude/CLAUDE.md`: mantra と重複する節を削除し、myak の節だけを残す。
- メモリ: `feedback_follow_claude_md_rules`、`feedback_model_delegation_strategy`、`MEMORY.md` の索引行を新しい規約に合わせて更新する。`project_superpowers_evaluation` には、比較の前提が変わったことを注記する。
- `~/.claude/skills/mantra*` と `~/.claude/templates/pr-automation` を trash に移す。`~/.mantra/generated` は P5 が終わるまで残す。

## 7. フェーズ計画とオーケストレーション

```
P0 安全化と基準値 ─▶ ┬─ P1 ルール（私）              ─┬─▶ P3 文書 ─▶ P4 切り替え ─▶ P5 効果測定（4週後・8週後）
                       └─ P2 エージェント・hooks・scripts（sonnet）┘
                          （マージは P1 → P2 の順。P2 は P1 の上に rebase してからマージする）
```

- **ライブ設定**
  - P0 で p-judge の登録を外したあとは、ライブの checkout（`feat/p-judge-hook`）には P4 まで触らない。push もしない。
  - P1〜P3 の PR をマージしても、ライブ設定は変わらない。P4 の deploy で一度に切り替える。
- **並列**: P1 と P2 は並行して進める。P1 は `rules/` の本文だけを触る。P2 はそれ以外（agents、hooks、scripts、tests、CI、package.json）を担当する。README と docs は P3 で扱う。同時に動かすサブエージェントは最大 2 体。
- **使わないもの**
  - Workflow ツールと Agent Teams は使わない。小規模で、明示的な指示もないため。
  - Agent ツールに `name` を渡さない。Teams のフラグが有効なので、渡すと teammate として起動してしまうため。
- **作業場所**: worktree は `git worktree add -b <branch> .maw-workspaces/<name> origin/main` で作る（P2 で TypeScript を消すまでは、`npm ci` も実行する）。
- **P2 のサブエージェントへの禁止事項**: `npm run setup`、`onboarding*`、`sync:*` を実行しない。ライブの `~/.claude` には書き込まない。

| フェーズ | 作業 | 担当 | モデル | 理由 |
|---|---|---|---|---|
| 全体 | 判断、統合、全差分の確認、PR 作成、切り替え | メインセッション（私） | Opus 5.5 | 文脈と判断が必要で、ライブ設定に触れるため |
| P0 | バックアップ、自動マージの停止、p-judge の登録解除、未コミットの 2 ルールをローカルでコミット、タグ付け、PR #62 のクローズ、`cleanupPeriodDays` の設定 | 私が直接 | Opus 5.5 | ライブ設定と外部への操作を含むため |
| P1 | 4 ファイルのルールを書き直す。旧ルールの全文について「残す / 統合する / 削除する（理由）」の対応表を作る | 私が直接 | Opus 5.5 | 全セッションの振る舞いを決める本文なので、判断が中心になる |
| P1 | 対応表への反論（必要な規則が抜けていないか） | mob-critic | opus | 抜けは気づきにくいため。この回は重要な判断なので opus を指定する |
| P2 | 11 体と TypeScript 一式の削除、4 体の短縮、guard.sh、install / deploy / verify.sh、CI | general-purpose（worktree を指定） | sonnet | 仕様が決まった削除と小さなシェルスクリプトなので |
| P2 | レビュー | code-reviewer と security-reviewer | sonnet | 削除漏れ、install.sh の冪等性と安全性、ガードの抜け道を見るため |
| P3 | README（英日 2 本）と docs の書き直し、退役した文書の削除、HANDOVER | general-purpose | sonnet | 文書の作業なので |
| P4 | 切り替えの手順書と戻し方への反論 | mob-critic | opus | ライブ設定とデータの移動を伴うため |
| P4 | 実行と確認 | 私が直接 | Opus 5.5 | 項目ごとに承認を得るため |
| P5 | 効果の測定 | 私（とユーザーの `/insights`） | — | 新しい仕組みは作らない |

### 検証ゲート
- **G1**: worktree で `npm run verify` が通ること。P2 以降は、新しい verify.sh が通ること。
- **G2**: レビュアーが CRITICAL または HIGH とした指摘が 0 件であること。P1 の対応表は、mob-critic とユーザーの両方が確認すること。
- **G3**: 私が全差分を読み、範囲外の変更がないこと。各サブエージェントの作業前後で、次の 2 つが変わっていないこと。
  - `git -C ~/src/mantra status --porcelain` の出力
  - `~/.mantra/generated/agents` と `~/.claude/settings.json` のハッシュ
- **G4**: PR の本文に、退役させたものの一覧と戻し方（タグ `pre-redesign` から）を書くこと。
- **G5（P4）**: 次の順で進めること。
  1. 一時 HOME で、本番と戻し方の両方をリハーサルする。
  2. バックアップを取る。
  3. `~/.mantra/live` を clone する。
  4. `deploy.sh` を実行する。
  5. settings.json と CLAUDE.md とメモリを、項目ごとに承認を得て更新する。
  6. 新しいセッションで確認する。
     - `/context` で、ルールが 200 行以下になっていること
     - エージェントの一覧が、4 体＋組み込み＋web-search-agent になっていること
     - `/hooks` に guard だけがあること
     - planner に、ルールの番兵行（例: FM-VERSION の見出し）を引用させられること
  7. 失敗したら、バックアップとタグから戻す。

### 各フェーズの詳細
- **P0**（push はしない）
  1. バックアップを `~/.claude/backups/mantra-redesign-20261015/` に `cp -RL` で取る。対象は settings.json、CLAUDE.md、`~/.claude.json`、`~/.mantra/generated/agents`。あわせて `~/.claude/agents` と `~/.claude/rules` のリンク先を記録する。
  2. `gh workflow disable auto-merge.yml` で自動マージを止める。PR #62 に自動マージの予約がないことは確認済み。main には保護設定がなく、ruleset は削除と force-push を禁止しているだけで、必須チェックはない。
  3. settings.json から p-judge を外す。
  4. 2 つのルールを、ライブの checkout でローカルにコミットする。
  5. ローカルにタグ `pre-redesign` を付ける。
  6. PR #62 に計測結果をコメントしてからクローズする。
  7. `cleanupPeriodDays` を設定する。

  2、3、6、7 は、実行前に承認を得る。
- **P1**（`feat/redesign-p1-rules`）
  - 入力は、旧ルール 12 ファイルと、CLAUDE.md・メモリの該当部分。
  - 理由を添えて短く書く。条件の列挙や強調の乱用はしない。
- **P2**（`feat/redesign-p2-slim`）: §6 の内容。P1 のマージ後に rebase して、行数上限の検査を通す。
- **P3**（`feat/redesign-p3-docs`）: README には、何をするリポジトリか、なぜ小さいか、install / deploy の方法、新しいモデルが出たら `/doctor prompt-audit` を実行して 1 行ずつ削るという運用、を書く。
- **P4**: G5 のとおりに進める。
- **P5**: §8 の指標を 4 週後と 8 週後に測る。悪化していたら、文章を足すのではなく、その一点に絞った規則 1 行か hook で対処する。どの 1 行を戻せばよいかは、対応表から引けるようにしておく。

## 8. 成功の測り方（新しい仕組みは作らない）

| 指標 | 基準値 | 目標 | 測り方 |
|---|---|---|---|
| 常時読み込むルールの量 | 1,159 行・約 40KB | 200 行以下・8KB 以下 | verify.sh と `/context` |
| コードを変更したセッションのうち、頼まなくてもレビュー役が起動した割合 | 60%（3/5） | 60% 以上を維持 | transcript を数える（`cleanupPeriodDays` で保持） |
| 「サブエージェントや安いモデルを使って」「毎回言わないと」系の言い直し | 約月 1 回 | 8 週で 0〜1 回 | myak で検索 |
| サブエージェントを使う計画に、オーケストレーション・モデル・ゲートが書かれている割合 | 07-09 に差し戻しあり | 100% | 次の 3 件を目視で確認 |
| バージョンの取り違え、頼んでいない範囲の変更 | `/insights` の主な不満 | 減少 | 4 週後と 8 週後に `/insights` |

サンプルが小さく、偶然で合格する可能性がある。そのため、最後の安全網はユーザー自身の指摘とし、指摘を受けたら対応表から該当の 1 行を戻す。

### 追加の検証項目: サブエージェントの畳み込み（2026-10-24 追記）

きっかけは Anthropic の記事「Building agents: when to fold subagents into your main agent loop」。記事の主張は 2 つある。計画は実行するモデル自身がコンテキストの中で書き、結果を見て直していくほうがよい。エージェント間で受け渡すたびに詳細が落ちる。ブラックボックスの検証は分けやすい作業として挙がっているので、レビュー役 3 体はこの検証の対象にしない。guard も「ハードな制限はハーネスに置く」という記事の指針どおりなので対象外。

P5 の測定が終わるまでは何も変えない。測定中に 2 つ以上を変えると、どれが効いたのか分からなくなるため。

| 仮説 | 指標 | 測り方 | 判断の基準 |
|---|---|---|---|
| H1: planner はメインセッションの計画に畳み込める | planner の起動回数。その計画が実行中に崩れた件数（手順の組み替え、やり直し）。メインセッションが自分で書いた計画の同じ件数 | transcript を数える | planner の計画のほうが崩れにくいという差が見えなければ、planner をやめ、メインセッションのプランモードで計画する |
| H2: 実装の委譲は条件付きにできる | sonnet の general-purpose に実装を委譲した回数。1 回あたりの往復（仕様の受け渡し、報告、diff の確認、手直し）。手戻りの件数 | transcript を数える | 手直しの往復が目立つなら、委譲は「並列に進める作業」と「多数のファイルを読む作業」に限る。実装が中心のセッションは、メインのモデルを sonnet にする案を試す |

- planner を畳んでもルールは効く。§3 で確かめたとおり、ルールを読まないのは組み込みの Plan と Explore で、メインセッションは読む。置き換え先は組み込みの Plan ではなく、メインセッション。
- メインセッションも opus で動いているので、planner を通して得られるのはモデルの差ではなく、コンテキストを分けることだけ。
- 起動が少なすぎて比べられないときは、§3 と同じく「使われていない」と記録する。
- 変えるのは 1 つずつ。H1 を 4 週後（2026-11-12）の測定のあとに変え、H2 は 8 週後（2026-12-10）の測定で H1 の影響を見てから変える。
- 戻す手順: planner は git の履歴から戻す。`delegation.md` で変える行は、対応表（`docs/redesign/rules-mapping.md`）に記録しておく。

## 9. リスク

| リスク | 重大度 | 対策 |
|---|---|---|
| 削りすぎて「毎回言わないと」が再発する | High | 「頼まれなくても行うこと」の節と FM-AGENT-CRITIC を必ず残し、テストする。planner も残す。P5 で測る。戻す 1 行は対応表に記録しておく |
| 切り替えでライブのエージェントやファイルを失う | High | `cp -RL` によるバックアップ、本番と戻し方の両方のリハーサル、install.sh による移動と保全、タグ。`~/.mantra/generated` は P5 が終わるまで残す |
| P2 の作業中に古いスクリプトがライブ設定を壊す | Medium | 実行の禁止と、G3 のハッシュ確認 |
| 退役させたものが実は必要だった | Medium | タグから戻せる。P5 で myak を使い、「欲しかった場面」がなかったかを確かめる |
| 調べた範囲が小さい | Medium | 結論は「未証明」と「未使用」に限って述べる。P5 で継続して測る |
| 自動マージで人の承認なしにマージされる | Low | P0 で止め、P2 で一式を削除する |

## 10. スコープ外

- myak の変更。
- `~/.codex` と Codex.app の削除（ユーザーが行う）。
- 新しいリポジトリへのハーネス導入（必要になったら `templates/` を使う）。
- 評価の仕組みを新たに作ること。

## 11. 実施記録

- **2026-10-15 承認**: オーナーが案 A′ を承認した。外部に影響する操作は、その都度確認を取ってから行う。
- **2026-10-15 P0 完了**（いずれも確認を得て実施）
  - `~/.claude/backups/mantra-redesign-20261015/` にバックアップを取った。対象は settings.json、CLAUDE.md、`~/.claude.json`、generated agents、memory。リンク先も記録した。
  - `auto-merge.yml` を無効にした。
  - settings.json から p-judge を削除し、`cleanupPeriodDays: 120` を追加した。
  - 2 つのルールをライブの checkout でローカルにコミットした（`b6d2c61`）。push はしていない。同じ commit にタグ `pre-redesign` を付けた。
  - PR #62 に計測結果をコメントし、クローズした。
  - この計画書を PR #63 にした。
- **確定した判断**
  - **D2a**: エージェントはファイル単位のシンボリックリンクにする。サブディレクトリのリンクが読まれるかを確かめる手間と、その不確実さを避けるため。
  - **組み込みエージェントのルール読み込み**: 実機で確かめた。組み込みの Plan と Explore はルールを読まない。general-purpose と自作のエージェントは読む。この結果を受けて planner を残した。
  - **main ブランチの保護**: branch protection は設定されていない。ruleset `main` があるが、内容は削除と force-push の禁止だけで、必須チェックはない。
- **注意**: `~/.claude/skills` のうち 6 件（gh-address-comments、gh-fix-ci、gh-issue-projects-inventory、gh-pr-review-autofix、project-audit、sisho）は、`~/.codex/skills` へのリンクになっている。`~/.codex` を消すと、これらも使えなくなる。
- **2026-10-15 P1〜P3 完了**: PR #65（rules）、#66（agents、hooks、scripts）、#67（docs）を積み重ねてマージし、最後に #63 を main にマージした（`7bda3a4`）。
  - レビューの経過:
    - code-reviewer の判定は BLOCK。shellcheck の指摘を修正した。
    - security-reviewer は 2 回。guard の抜け道、deploy の検証ゲート、本物の HOME を守る規則、export の不一致を修正した。
    - mob-critic は 2 回（P1 の対応表、P4 の手順書）。
  - verify は 14 項目すべて PASS（テスト 326 件、shellcheck を含む）。CI の validate も PASS。
  - #64（deepen-request スキル）との README の衝突は、手で解消した。
- **2026-10-15 P4 完了**: 手順書 v2 で切り替えた。中身は次のとおり。
  - deploy して `~/.mantra/live` を `7bda3a4` にした。
  - settings.json を整理した: guard を差し替え、codex 関連と表示されないフックを削除し、zed と console.log のフックを `systemMessage` に直した。
  - `claude mcp remove codex` を実行した。
  - CLAUDE.md を myak の節だけにした。
  - メモリを更新した。
  - `~/.claude/skills/mantra*` と `~/.claude/templates/pr-automation` を削除した。
  - 開発用の checkout を main に切り替えた。
  - 確認: 新しい `claude -p` セッションで、ルール 4 ファイル、新しい番兵行、エージェントの一覧を確かめた。guard の拒否が効くことも実地で確かめた。
  - 残り: `core.hooksPath githooks` の設定は、guard が拒否するためユーザーが行う。guard の誤検知（読み取りの形、サブシェルの閉じ括弧、引用符の中の文字列）は別作業として直す。
- **P5 予定**: 2026-11-12 と 2026-12-10。
