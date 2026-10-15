# 他のリポジトリに最小限のハーネスを入れる

mantra 自体ではなく、ほかのリポジトリに小さなハーネスを足すときのガイドです。mantra 自体の説明は [README](../../README.md) にあります。

目的は、どのリポジトリでも「どこを見て、何を実行すればよいか」が最初の 1 分で分かるようにすることです。長い文書を足すことは目的ではありません。

## 手順

1. 薄い `AGENTS.md` を置く。
2. 検証コマンドを 1 本に決める。
3. pre-push フックと CI から、同じコマンドを呼ぶ。
4. 機械で守れることは、文章ではなく hook にする。
5. 作業は隔離した worktree で行う。
6. 引き継ぎは、必要になったときだけ用意する。

## 1. 薄い AGENTS.md

`AGENTS.md` は入口だけにします。ひな形は [templates/repo-agents-pointer.md](../../templates/repo-agents-pointer.md) です。

- `Canonical Verify`: 最初に実行する 1 本のコマンド
- `Test Ladder`: どの変更でどのテストを走らせるか
- `Session Continuity`: 任意。`HANDOVER.md` か myak
- `Canonical Docs`: 詳しい説明の置き場所

仕様や運用メモは、ここに書かずに別の文書へ置いて、リンクだけ張ります。1 画面で読める量に収めてください。長くするほど、本当に守らせたい行が読まれにくくなります。

## 2. 検証コマンドは 1 本

人にもエージェントにも分かる、検証コマンドを 1 本だけ決めます。例は `npm run verify` や `make check` です。補助のテストは、変更の種類に応じて使い分けます。

- `default`: unit、lint、typecheck、contract。毎回走らせる。
- `visual`: 見た目や出力レイアウトを変えたときだけ。
- `acceptance`: 重要なフローや外部連携、リリース前だけ。

visual と acceptance を毎回の push に載せないでください。ただし、実行方法と成果物の置き場所は文書に残します。

## 3. pre-push と CI

検証コマンドは、2 か所から同じものを呼びます。

- ローカルの pre-push。ひな形は [templates/repo-pre-push.example.sh](../../templates/repo-pre-push.example.sh) です。リポジトリ側の `githooks/` に置き、`git config core.hooksPath githooks` で有効にします。
- CI。pull request と main への push で実行します。

pre-push は、毎回の push で待てる時間に収めます。重いゲートは CI か手動の手順に回します。エディタやツールの hook がない環境でも、この 2 か所は効きます。mantra 自身も同じ構成です（`githooks/pre-push` と `.github/workflows/validate.yml`）。

## 4. 機械で守れることは hook にする

hook は、説明ではなく、実行される軽いガードとして置きます。

- **PreToolUse**: 破壊的な操作を止めます。`git reset --hard`、`rm -rf`、`git push --force`、`--no-verify` などです。mantra の [hooks/guard.sh](../../hooks/guard.sh) が実装例です。拒否は `permissionDecision: deny` の JSON で返します。jq がなければ何もしない fail-open にして、事故を防ぐシートベルトと割り切ります。
- **Stop**: 変更があるのに検証していないときに、検証コマンドを走らせることもできます。任意です。失敗で止める場合は、無限ループを避けるため、入力の `stop_hook_active` を確認してください。

文章のルールは短く保ちます。1 行ごとに「消すとミスが起きるか」を問い、起きない行は削ります。モデルが新しくなったら、同じ見直しをもう一度行います。読み飛ばされると困るルールは、文章を増やさずに hook か CI へ移します。

## 5. 隔離した作業場所

Claude Code の標準機能を使います。

- `claude -w` で、worktree の中でセッションを始めます。
- サブエージェントが書き込みをするなら、frontmatter に `isolation: worktree` を指定します。

未コミットの差分があるツリーで、直接編集を始めないでください。`maw` などの独自ツールは必要ありません。

## 6. 引き継ぎ（任意）

セッションをまたぐ作業には、`HANDOVER.md` か myak が使えます。残すのは、目的、ブロッカー、次の一手、根拠になる参照先です。台帳を別に用意する必要はありません。maw や Obsidian は、すでに使っているなら使ってよい、という扱いです。

## 導入の順序

1. `AGENTS.md` をポインタ型にする。
2. 検証コマンドを決めて、`AGENTS.md` に書く。
3. pre-push と CI を、そのコマンドにそろえる。
4. 事故が実際に起きた操作から順に、hook で止める。
5. visual と acceptance の手順を、文書にまとめる。
