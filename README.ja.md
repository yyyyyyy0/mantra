# mantra

English: [README.md](./README.md)

自分用の Claude Code ハーネスです。短いルール 4 ファイル、エージェント 4 体、ガードフック 1 つを、専用の clone から `~/.claude` にリンクして使います。必要なのは bash と jq だけです。

## これは何か

Claude Code は、セッションのたびに `~/.claude/rules` と `~/.claude/agents` を読み込みます。mantra はこの 2 つをバージョン管理するためのリポジトリで、安全に変更するためのスクリプトも含みます。

- **ルール**: 自分の流儀を書いています。頼まなくてもサブエージェントやレビューを使うこと、足りる範囲でいちばん安いモデルを選ぶこと、よくある手抜きを避けること、git の作業手順。
- **エージェント**: `planner`（opus）と、レビュー役の `code-reviewer`、`security-reviewer`、`mob-critic`（sonnet）。
- **ガードフック**: 破壊的なコマンドと、git フックの回避を拒否する PreToolUse フック。
- **テンプレート**: ほかのリポジトリに小さなハーネスを入れるためのもの。

## なぜ小さいか

以前の mantra は、もっと大きなものでした。エージェントが 15 体、TypeScript の同期ツール、毎回読み込まれる約 40KB のルールがありました。使用実績を調べたところ、大半は使われていないか、効いている形跡がありませんでした。最近の指針も、常時読み込む指示は短くして、新しいモデルが出るたびに削る方向です。そこでルールは 200 行・8KB までに絞り、残りは退役させました。根拠と考え方は [docs/MODERNIZATION_PLAN.md](./docs/MODERNIZATION_PLAN.md) にあります。以前の内容は、git タグ `pre-redesign` から戻せます。

## 構成

| パス | 内容 |
|---|---|
| `rules/` | `delegation.md`、`performance.md`、`failure-modes.md`、`git-workflow.md`（常時読み込み。合計 200 行・8KB まで） |
| `agents/` | `planner`、`code-reviewer`、`security-reviewer`、`mob-critic` |
| `hooks/guard.sh` | 破壊的コマンドとフック回避を止める PreToolUse ガード |
| `scripts/` | `install.sh`、`deploy.sh`、`verify.sh` |
| `githooks/pre-push` | push の前に `scripts/verify.sh` を実行 |
| `tests/` | ガード、`install.sh`、`deploy.sh` のシェルテスト |
| `templates/` | ほかのリポジトリ向けの、ポインタ型 `AGENTS.md` と pre-push フック |
| `docs/` | 再設計の計画、ルールの対応表、[他リポジトリ向けのハーネス導入ガイド](./docs/ja/harness-engineering.md) |

## インストール

checkout は 2 つあります。開発用 checkout（例: `~/src/mantra`）では、ブランチや worktree を自由に使って作業します。ライブ用の clone `~/.mantra/live` は origin/main に detached で固定され、`~/.claude` はここだけを指します。そのため、作業中の変更がライブの設定に影響することはありません。

初回は、開発用 checkout から次を実行します。

```sh
scripts/deploy.sh --init
```

ライブ用の clone を作り、続けてデプロイします。リンクを張るのは `scripts/install.sh` です。

- `~/.claude/rules` は、`<live>/rules` へのシンボリックリンクになります。
- `~/.claude/agents/` は実ディレクトリになり、mantra のエージェントごとに 1 本ずつリンクが入ります。すでにあるほかのエージェントはそのまま残ります。
- `--dry-run` があります。何度実行しても結果は同じで、`settings.json` は書き換えません。
- ライブ用の clone 以外からは実行できません（本物の HOME では `~/.mantra/live` からだけです）。

ガードは、`~/.claude/settings.json` に一度だけ手で登録します。すでに hooks があれば、そこへ追記してください。

```json
"PreToolUse": [{"matcher": "Bash", "hooks": [{"type": "command", "command": "bash ~/.mantra/live/hooks/guard.sh"}]}]
```

ガードは fail-open です。jq がないと何もしません。事故を防ぐシートベルトであり、サンドボックスではありません。

開発用 checkout では、pre-push のゲートを一度だけ有効にします。

```sh
git config core.hooksPath githooks
```

## 更新の流れ

1. 開発用 checkout のブランチか worktree で変更し、PR を出します。
2. CI（`validate`）が `scripts/verify.sh` を実行します。
3. 人がマージします。
4. 開発用 checkout から `scripts/deploy.sh` を実行します。

`scripts/deploy.sh [--init] [--dry-run] [--force]` は次の順に動きます。

- ライブ用 clone で origin を fetch します。fast-forward できない場合は、`--force` を付けない限り止まります。
- 変更される内容を `git log --stat` で表示します。
- 切り替える前に、一時ディレクトリへ export した origin/main を検証します（`bash -n hooks/guard.sh` と `scripts/verify.sh`）。
- origin/main を detached で checkout し、`install.sh` を実行します。失敗したら、元のコミットに戻します。

## 検証

```sh
npm run verify    # bash scripts/verify.sh と同じ
```

依存パッケージはありません。必要なのは bash と jq です。shellcheck は、ローカルでは任意、CI では必須です。次を検査します。

- 常時読み込むルールの上限（200 行・8KB）
- `rules/` に必ず残す文言（番兵）
- `rules/` と `agents/` に `../` 形式の相対リンクがないこと
- エージェントの frontmatter。`hooks`、`mcpServers`、`permissionMode` を使っていないこと
- `tests/` のシェルテスト
- shellcheck

## 保守

- 新しい Claude モデルが出たら `/doctor prompt-audit` を実行し、ルールを 1 行ずつ「消すとミスが起きるか」で確かめます。起きないなら削ります。
- 退役させた振る舞いを戻したいときは、[docs/redesign/rules-mapping.md](./docs/redesign/rules-mapping.md) で該当箇所を探し、`git show pre-redesign:rules/<file>` から 1 行だけ戻します。

## ほかのリポジトリへ

ほかのリポジトリに最小限のハーネスを入れる方法は、[docs/ja/harness-engineering.md](./docs/ja/harness-engineering.md) にあります。テンプレートは 2 つです。[templates/repo-agents-pointer.md](./templates/repo-agents-pointer.md) は、詳細は別の文書に任せる薄い `AGENTS.md` です。[templates/repo-pre-push.example.sh](./templates/repo-pre-push.example.sh) は、verify コマンドを 1 本呼ぶだけの pre-push フックです。

## ライセンス

MIT です。[LICENSE](./LICENSE) を見てください。
