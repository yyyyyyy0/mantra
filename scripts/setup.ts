import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { z } from 'zod'
import {
  CliError,
  ensureNodeVersion,
  ensureReadableDirectory,
  ensureWritableParent,
  finishCommand,
  hasJsonFlag,
  toCliError,
  writeInfo,
  writeJsonLine,
  writeWarn,
  writeWarningEvent,
  type WarningEvent,
} from './lib/cli-telemetry'
import {
  hasUserSources,
  listContentFiles,
  resolveContentSources,
  type ContentKind,
  type ContentSource,
} from './lib/content-sources'

interface SetupLink {
  src: string
  dest: string
  label: string
}

const ArgsSchema = z.object({
  force: z.boolean(),
  json: z.boolean(),
})

type SymlinkResult =
  | { success: true; dest: string; label: string; src: string }
  | {
      success: false
      dest: string
      label: string
      message: string
      errorCode: CliError['code']
      retryable: boolean
    }

function parseArgs(): z.infer<typeof ArgsSchema> {
  return ArgsSchema.parse({
    force: process.argv.includes('--force'),
    json: hasJsonFlag(process.argv),
  })
}

function pathExists(p: string): boolean {
  try {
    fs.lstatSync(p)
    return true
  } catch {
    return false
  }
}

function formatTimestamp(date: Date): string {
  const y = String(date.getFullYear())
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${y}${m}${d}${hh}${mm}${ss}`
}

function buildBackupPath(dest: string): string {
  const timestamp = formatTimestamp(new Date())
  const base = `${dest}.bak-${timestamp}`

  if (!pathExists(base)) {
    return base
  }

  let index = 2
  while (pathExists(`${base}-${index}`)) {
    index++
  }
  return `${base}-${index}`
}

function prepareDestination(dest: string, label: string, force: boolean, json: boolean): void {
  if (!pathExists(dest)) {
    return
  }

  if (!force) {
    throw new CliError(
      `${label} はすでに存在します。上書きするには --force を使用してください`,
      'E_INPUT_INVALID',
      false,
    )
  }

  const stat = fs.lstatSync(dest)
  if (stat.isSymbolicLink()) {
    fs.unlinkSync(dest)
    return
  }

  const backupPath = buildBackupPath(dest)
  fs.renameSync(dest, backupPath)
  writeInfo(json, `⚠ backup created: ${backupPath}`)
}

function createSymlink(link: SetupLink, force: boolean, json: boolean): SymlinkResult {
  try {
    if (!fs.existsSync(link.src)) {
      throw new CliError(`ソースディレクトリが存在しません: ${link.src}`, 'E_INPUT_INVALID', false)
    }

    prepareDestination(link.dest, link.label, force, json)
    fs.mkdirSync(path.dirname(link.dest), { recursive: true })
    fs.symlinkSync(link.src, link.dest)
    writeInfo(json, `✓ ${link.label} → ${link.src}`)
    return { success: true, dest: link.dest, label: link.label, src: link.src }
  } catch (err) {
    const cliErr = toCliError(err)
    writeWarn(json, `✗ ${link.label}: ${cliErr.message}`)
    writeJsonLine(json, {
      type: 'error',
      command: 'setup',
      target: link.label,
      message: cliErr.message,
      error_code: cliErr.code,
      retryable: cliErr.retryable,
    })
    return {
      success: false,
      dest: link.dest,
      label: link.label,
      message: cliErr.message,
      errorCode: cliErr.code,
      retryable: cliErr.retryable,
    }
  }
}

function buildMergedDirectory(
  kind: ContentKind,
  json: boolean,
): { dir: string; files: number; warnings: WarningEvent[] } {
  const files = listContentFiles(kind)
  if (files.length === 0) {
    throw new CliError(`${kind} のソースファイルが見つかりません`, 'E_INPUT_INVALID', false)
  }

  const outputDir = path.join(os.homedir(), '.mantra', 'generated', kind)
  ensureWritableParent(path.join(outputDir, '.touch'), `${kind} merged directory`)
  fs.rmSync(outputDir, { recursive: true, force: true })
  fs.mkdirSync(outputDir, { recursive: true })

  // Later sources (user) override earlier ones (core) with the same filename.
  const entries = new Map<string, (typeof files)[number]>()
  const collected: WarningEvent[] = []

  for (const file of files) {
    const existing = entries.get(file.relativeName)
    if (existing !== undefined) {
      const loser = conflictLoser(existing.source)
      const event: WarningEvent = {
        type: 'warning',
        command: 'setup',
        code: 'W_SOURCE_CONFLICT_FILENAME',
        winner: file.source.origin,
        loser,
        target: file.relativeName,
        message: `filename conflict; ${file.source.origin} overrides ${loser} for "${file.relativeName}"`,
      }
      writeWarningEvent(json, event)
      collected.push(event)
    }
    entries.set(file.relativeName, file)
  }

  for (const [name, contentFile] of entries) {
    fs.symlinkSync(contentFile.fullPath, path.join(outputDir, name))
  }

  writeInfo(json, `merged ${kind}: ${entries.size} files -> ${outputDir}`)
  return { dir: outputDir, files: entries.size, warnings: collected }
}

function conflictLoser(source: ContentSource): WarningEvent['loser'] {
  if (source.origin === 'core') {
    return 'core'
  }
  return `user:${source.dir}`
}

function coreDirectory(kind: ContentKind): string {
  const sources = resolveContentSources(kind).filter(s => s.origin === 'core')
  if (sources.length === 0) {
    throw new CliError(`core ${kind} directory not found`, 'E_INPUT_INVALID', false)
  }
  return sources[0].dir
}

function buildSetupLinks(json: boolean): {
  links: SetupLink[]
  mergedKinds: Array<{ kind: ContentKind; files: number; dir: string }>
  warnings: WarningEvent[]
} {
  const mergedKinds: Array<{ kind: ContentKind; files: number; dir: string }> = []
  const allWarnings: WarningEvent[] = []

  const agentsSrc = hasUserSources('agents')
    ? (() => {
        const merged = buildMergedDirectory('agents', json)
        mergedKinds.push({ kind: 'agents', files: merged.files, dir: merged.dir })
        allWarnings.push(...merged.warnings)
        return merged.dir
      })()
    : coreDirectory('agents')

  const rulesSrc = hasUserSources('rules')
    ? (() => {
        const merged = buildMergedDirectory('rules', json)
        mergedKinds.push({ kind: 'rules', files: merged.files, dir: merged.dir })
        allWarnings.push(...merged.warnings)
        return merged.dir
      })()
    : coreDirectory('rules')

  for (const kind of ['templates', 'examples'] as const) {
    if (hasUserSources(kind)) {
      const merged = buildMergedDirectory(kind, json)
      mergedKinds.push({ kind, files: merged.files, dir: merged.dir })
      allWarnings.push(...merged.warnings)
    }
  }

  return {
    links: [
      {
        src: agentsSrc,
        dest: path.join(os.homedir(), '.claude', 'agents'),
        label: '~/.claude/agents',
      },
      {
        src: rulesSrc,
        dest: path.join(os.homedir(), '.claude', 'rules'),
        label: '~/.claude/rules',
      },
    ],
    mergedKinds,
    warnings: allWarnings,
  }
}

function main(): void {
  const { force, json } = parseArgs()
  const startedAt = Date.now()

  try {
    ensureNodeVersion(20)
    const { links, mergedKinds, warnings } = buildSetupLinks(json)

    for (const link of links) {
      ensureReadableDirectory(link.src, `${link.label} source`)
      ensureWritableParent(link.dest, `${link.label} destination`)
    }

    writeInfo(json, 'mantra セットアップを開始します...\n')

    const results = links.map(link => createSymlink(link, force, json))
    const successes = results.filter(r => r.success)
    const failures = results.filter(r => !r.success)

    writeInfo(json, `\n${successes.length}/${links.length} 件のシムリンクを作成しました`)

    if (failures.length > 0) {
      writeInfo(json, '\n次のコマンドで強制上書きできます:')
      writeInfo(json, '  npm run setup -- --force')
      finishCommand({
        command: 'setup',
        json,
        startedAt,
        success: false,
        error: new CliError('セットアップに失敗しました', failures[0].errorCode, failures[0].retryable),
        details: {
          created: successes.length,
          total: links.length,
          merged: mergedKinds,
          failures: failures.map(f => ({
            target: f.label,
            error_code: f.errorCode,
            message: f.message,
          })),
        },
        warnings,
      })
      process.exit(1)
    }

    writeInfo(json, '\nセットアップが完了しました。')
    writeInfo(json, '次のステップ: npm run sync:codex')
    finishCommand({
      command: 'setup',
      json,
      startedAt,
      success: true,
      details: {
        created: successes.length,
        total: links.length,
        merged: mergedKinds,
      },
      warnings,
    })
  } catch (err) {
    const cliErr = toCliError(err)
    writeWarn(json, cliErr.message)
    finishCommand({
      command: 'setup',
      json,
      startedAt,
      success: false,
      error: cliErr,
    })
    process.exit(1)
  }
}

main()
