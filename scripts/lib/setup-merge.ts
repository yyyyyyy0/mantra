import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  CliError,
  ensureWritableParent,
  writeInfo,
  writeWarningEvent,
  type WarningEvent,
} from './cli-telemetry'
import {
  listContentEntries,
  type ContentEntry,
  type ContentEntryWarningHook,
} from './content-entries'
import { ContentKind, ContentSource, resolveContentSources } from './content-sources'

export interface BuildMergedDirectoryResult {
  dir: string
  files: number
  warnings: WarningEvent[]
}

export interface MergedKindSummary {
  kind: ContentKind
  files: number
  dir: string
}

export function conflictLoser(source: ContentSource): WarningEvent['loser'] {
  if (source.origin === 'core') {
    return 'core'
  }

  return `user:${source.dir}`
}

export function coreDirectory(kind: ContentKind): string {
  const sources = resolveContentSources(kind).filter(source => source.origin === 'core')

  if (sources.length === 0) {
    throw new CliError(`core ${kind} directory not found`, 'E_INPUT_INVALID', false)
  }

  return sources[0].dir
}

export function buildMergedDirectory(
  kind: ContentKind,
  json: boolean,
): BuildMergedDirectoryResult {
  const contentEntries = listContentEntries(kind, { target: 'claude' })
  if (contentEntries.entries.length === 0) {
    throw new CliError(`${kind} のソースファイルが見つかりません`, 'E_INPUT_INVALID', false)
  }

  const outputDir = path.join(os.homedir(), '.mantra', 'generated', kind)
  ensureWritableParent(path.join(outputDir, '.touch'), `${kind} merged directory`)
  fs.rmSync(outputDir, { recursive: true, force: true })
  fs.mkdirSync(outputDir, { recursive: true })

  // Later sources (user) override earlier ones (core) with the same filename.
  const entries = new Map<string, ContentEntry>()
  const warnings: WarningEvent[] = []

  for (const hook of contentEntries.warningHooks) {
    const hookWarning = warningEventFromHook(hook)
    writeWarningEvent(json, hookWarning)
    warnings.push(hookWarning)
  }

  for (const file of contentEntries.entries) {
    const existing = entries.get(file.relativeName)
    if (existing !== undefined) {
      const loser = conflictLoser(existing.source)
      const winner = file.source.origin === 'user' ? 'user' : 'core'
      const event: WarningEvent = {
        type: 'warning',
        command: 'setup',
        code: 'W_SOURCE_CONFLICT_FILENAME',
        winner,
        loser,
        target: file.relativeName,
        message: `filename conflict; ${file.source.origin} overrides ${loser} for "${file.relativeName}"`,
      }
      writeWarningEvent(json, event)
      warnings.push(event)
    }

    entries.set(file.relativeName, file)
  }

  for (const [name, contentFile] of entries) {
    const destination = path.join(outputDir, name)
    if (contentFile.entryKind === 'legacy') {
      fs.symlinkSync(contentFile.fullPath, destination)
      continue
    }

    fs.writeFileSync(destination, contentFile.composedContent, 'utf8')
  }

  writeInfo(json, `merged ${kind}: ${entries.size} files -> ${outputDir}`)
  return { dir: outputDir, files: entries.size, warnings }
}

export function warningEventFromHook(hook: ContentEntryWarningHook): WarningEvent {
  const loser = conflictLoser(hook.source)
  const winner = hook.source.origin === 'user' ? 'user' : 'core'
  return {
    type: 'warning',
    command: 'setup',
    code: hook.code,
    winner,
    loser,
    target: hook.target,
    message: `${hook.message}; ${hook.winnerKind}(${hook.winnerPath}) overrides ${hook.loserKind}(${hook.loserPath})`,
  }
}
