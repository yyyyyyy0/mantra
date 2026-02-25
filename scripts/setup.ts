import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { z } from 'zod'

// ────────────────────────────────────────────────────────────
// 設定
// ────────────────────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(__dirname, '..')

const SYMLINKS: Array<{ src: string; dest: string; label: string }> = [
  {
    src: path.join(PROJECT_ROOT, 'agents'),
    dest: path.join(os.homedir(), '.claude', 'agents'),
    label: '~/.claude/agents',
  },
  {
    src: path.join(PROJECT_ROOT, 'rules'),
    dest: path.join(os.homedir(), '.claude', 'rules'),
    label: '~/.claude/rules',
  },
]

// ────────────────────────────────────────────────────────────
// 引数パース
// ────────────────────────────────────────────────────────────

const ArgsSchema = z.object({
  force: z.boolean(),
})

function parseArgs(): z.infer<typeof ArgsSchema> {
  const force = process.argv.includes('--force')
  return ArgsSchema.parse({ force })
}

// ────────────────────────────────────────────────────────────
// シムリンク作成
// ────────────────────────────────────────────────────────────

type SymlinkResult =
  | { success: true; dest: string; label: string }
  | { success: false; dest: string; label: string; message: string }

function pathExists(p: string): boolean {
  try {
    fs.lstatSync(p)
    return true
  } catch {
    return false
  }
}

function createSymlink(
  src: string,
  dest: string,
  label: string,
  force: boolean,
): SymlinkResult {
  try {
    if (!fs.existsSync(src)) {
      throw new Error(`ソースディレクトリが存在しません: ${src}`)
    }

    if (pathExists(dest)) {
      if (!force) {
        throw new Error(
          `${label} はすでに存在します。上書きするには --force を使用してください`,
        )
      }
      fs.rmSync(dest, { recursive: true, force: true })
    }

    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.symlinkSync(src, dest)

    process.stdout.write(`✓ ${label} → ${src}\n`)
    return { success: true, dest, label }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    process.stderr.write(`✗ ${label}: ${message}\n`)
    return { success: false, dest, label, message }
  }
}

// ────────────────────────────────────────────────────────────
// メイン
// ────────────────────────────────────────────────────────────

function main(): void {
  const { force } = parseArgs()

  process.stdout.write('mantra セットアップを開始します...\n\n')

  const results = SYMLINKS.map(({ src, dest, label }) =>
    createSymlink(src, dest, label, force),
  )

  const successes = results.filter(r => r.success)
  const failures = results.filter(r => !r.success)

  process.stdout.write(`\n${successes.length}/${SYMLINKS.length} 件のシムリンクを作成しました\n`)

  if (failures.length > 0) {
    process.stdout.write('\n次のコマンドで強制上書きできます:\n')
    process.stdout.write('  npm run setup -- --force\n')
    process.exit(1)
  }

  process.stdout.write('\nセットアップが完了しました。\n')
  process.stdout.write('次のステップ: npm run sync:codex\n')
}

main()
