import * as fs from 'node:fs'
import * as path from 'node:path'
import { CliError } from './cli-telemetry'
import { type ContentKind, type ContentSource, resolveContentSources } from './content-sources'
import {
  composeSkillFamily,
  familyDirectoryToRelativeName,
  isSkillFamilyDirectoryName,
  loadSkillFamily,
} from './skill-family'
import { type SkillFamilyTarget } from './skill-family-schema'

export type ContentEntryKind = 'legacy' | 'family'
export type ContentTarget = SkillFamilyTarget

export interface LegacyContentEntry {
  source: ContentSource
  entryKind: 'legacy'
  relativeName: string
  fullPath: string
}

export interface FamilyContentEntry {
  source: ContentSource
  entryKind: 'family'
  relativeName: string
  fullPath: string
  familyDir: string
  composedContent: string
  composedTarget?: ContentTarget
}

export type ContentEntry = LegacyContentEntry | FamilyContentEntry

export interface ContentEntryWarningHook {
  code: 'W_SOURCE_CONFLICT_FILENAME'
  policy: 'family-over-legacy'
  source: ContentSource
  target: string
  message: string
  winnerKind: 'family'
  loserKind: 'legacy'
  winnerPath: string
  loserPath: string
}

export interface ListContentEntriesResult {
  entries: ContentEntry[]
  warningHooks: ContentEntryWarningHook[]
}

function shouldIncludeLegacyFile(kind: ContentKind, fileName: string): boolean {
  if (kind === 'agents' || kind === 'rules') {
    return fileName.endsWith('.md')
  }

  return true
}

function sortedDirectoryNames(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .slice()
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

function toLegacyEntry(source: ContentSource, fullPath: string, relativeName: string): LegacyContentEntry {
  return {
    source,
    entryKind: 'legacy',
    relativeName,
    fullPath,
  }
}

function toFamilyEntry(
  source: ContentSource,
  familyDir: string,
  relativeName: string,
  target: ContentTarget,
): FamilyContentEntry {
  const loaded = loadSkillFamily(familyDir)
  const composed = composeSkillFamily(loaded, target)

  return {
    source,
    entryKind: 'family',
    relativeName,
    fullPath: familyDir,
    familyDir,
    composedContent: composed.content,
    composedTarget: composed.overlayTarget,
  }
}

function isFamilyPreferred(
  current: ContentEntry,
  incoming: ContentEntry,
): incoming is FamilyContentEntry {
  return current.entryKind === 'legacy' && incoming.entryKind === 'family'
}

function createFamilyConflictHook(
  source: ContentSource,
  relativeName: string,
  winnerPath: string,
  loserPath: string,
): ContentEntryWarningHook {
  return {
    code: 'W_SOURCE_CONFLICT_FILENAME',
    policy: 'family-over-legacy',
    source,
    target: relativeName,
    message: `family-over-legacy policy applied for "${relativeName}"`,
    winnerKind: 'family',
    loserKind: 'legacy',
    winnerPath,
    loserPath,
  }
}

function mergeEntriesByPolicy(sourceEntries: ContentEntry[]): {
  entries: ContentEntry[]
  warningHooks: ContentEntryWarningHook[]
} {
  const merged = new Map<string, ContentEntry>()
  const warningHooks: ContentEntryWarningHook[] = []

  for (const entry of sourceEntries) {
    const existing = merged.get(entry.relativeName)
    if (existing === undefined) {
      merged.set(entry.relativeName, entry)
      continue
    }

    if (isFamilyPreferred(existing, entry)) {
      warningHooks.push(
        createFamilyConflictHook(
          entry.source,
          entry.relativeName,
          entry.fullPath,
          existing.fullPath,
        ),
      )
      merged.set(entry.relativeName, entry)
      continue
    }

    if (existing.entryKind === 'family' && entry.entryKind === 'legacy') {
      warningHooks.push(
        createFamilyConflictHook(
          entry.source,
          entry.relativeName,
          existing.fullPath,
          entry.fullPath,
        ),
      )
      continue
    }

    // Preserve prior behavior: later entries win when the entry type is the same.
    merged.set(entry.relativeName, entry)
  }

  return {
    entries: [...merged.values()],
    warningHooks,
  }
}

function listEntriesForSource(
  source: ContentSource,
  kind: ContentKind,
  target: ContentTarget,
): { entries: ContentEntry[]; warningHooks: ContentEntryWarningHook[] } {
  const scanned: ContentEntry[] = []

  for (const name of sortedDirectoryNames(source.dir)) {
    const fullPath = path.join(source.dir, name)
    const stat = fs.statSync(fullPath)

    if (stat.isFile()) {
      if (!shouldIncludeLegacyFile(kind, name)) {
        continue
      }

      scanned.push(toLegacyEntry(source, fullPath, name))
      continue
    }

    if (stat.isDirectory() && isSkillFamilyDirectoryName(name)) {
      const relativeName = familyDirectoryToRelativeName(name)
      scanned.push(toFamilyEntry(source, fullPath, relativeName, target))
    }
  }

  return mergeEntriesByPolicy(scanned)
}

export function listContentEntries(
  kind: ContentKind,
  options: { target?: ContentTarget } = {},
): ListContentEntriesResult {
  const target = options.target ?? 'generic'
  const entries: ContentEntry[] = []
  const warningHooks: ContentEntryWarningHook[] = []

  for (const source of resolveContentSources(kind)) {
    if (!fs.existsSync(source.dir) || !fs.statSync(source.dir).isDirectory()) {
      throw new CliError(`content source directory が見つかりません: ${source.dir}`, 'E_INPUT_INVALID', false)
    }

    const result = listEntriesForSource(source, kind, target)
    entries.push(...result.entries)
    warningHooks.push(...result.warningHooks)
  }

  return {
    entries,
    warningHooks,
  }
}
