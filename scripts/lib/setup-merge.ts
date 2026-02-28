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
import { ContentKind, ContentSource, listContentFiles, resolveContentSources } from './content-sources'

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
  const warnings: WarningEvent[] = []

  for (const file of files) {
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
    fs.symlinkSync(contentFile.fullPath, path.join(outputDir, name))
  }

  writeInfo(json, `merged ${kind}: ${entries.size} files -> ${outputDir}`)
  return { dir: outputDir, files: entries.size, warnings }
}
