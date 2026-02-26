import * as fs from 'node:fs'
import * as path from 'node:path'
import { PROJECT_ROOT } from './project-paths'

export type ContentKind = 'agents' | 'rules' | 'templates' | 'examples'

export interface ContentSource {
  kind: ContentKind
  dir: string
  label: string
  origin: 'core' | 'user'
}

function parseList(raw: string | undefined): string[] {
  if (!raw) {
    return []
  }
  return raw
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)
}

function uniqueExistingDirs(input: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const entry of input) {
    const resolved = path.resolve(entry)
    if (!fs.existsSync(resolved)) {
      continue
    }
    if (!fs.statSync(resolved).isDirectory()) {
      continue
    }
    if (seen.has(resolved)) {
      continue
    }
    seen.add(resolved)
    out.push(resolved)
  }
  return out
}

function envKeyForKind(kind: ContentKind): string {
  return `MANTRA_USER_${kind.toUpperCase()}_DIRS`
}

export function resolveContentSources(kind: ContentKind): ContentSource[] {
  const coreDir = path.join(PROJECT_ROOT, kind)
  const sources: ContentSource[] = []

  if (fs.existsSync(coreDir) && fs.statSync(coreDir).isDirectory()) {
    sources.push({ kind, dir: coreDir, label: `${kind}:core`, origin: 'core' })
  }

  const rootDirs = uniqueExistingDirs(parseList(process.env.MANTRA_USER_CONTENT_ROOTS))
  for (const root of rootDirs) {
    const dir = path.join(root, kind)
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      sources.push({
        kind,
        dir,
        label: `${kind}:user-root:${root}`,
        origin: 'user',
      })
    }
  }

  const directDirs = uniqueExistingDirs(parseList(process.env[envKeyForKind(kind)]))
  for (const dir of directDirs) {
    sources.push({
      kind,
      dir,
      label: `${kind}:user-dir:${dir}`,
      origin: 'user',
    })
  }

  return sources
}

export interface ContentFile {
  source: ContentSource
  fullPath: string
  relativeName: string
}

export function listContentFiles(kind: ContentKind): ContentFile[] {
  const results: ContentFile[] = []
  for (const source of resolveContentSources(kind)) {
    const names = fs.readdirSync(source.dir)
    for (const name of names) {
      const fullPath = path.join(source.dir, name)
      const stat = fs.statSync(fullPath)
      if (!stat.isFile()) {
        continue
      }
      if ((kind === 'agents' || kind === 'rules') && !name.endsWith('.md')) {
        continue
      }
      results.push({
        source,
        fullPath,
        relativeName: name,
      })
    }
  }
  return results
}

export function hasUserSources(kind: ContentKind): boolean {
  return resolveContentSources(kind).some(s => s.origin === 'user')
}
