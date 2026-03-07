import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { z } from 'zod'
import { CliError } from './cli-telemetry'
import { PROJECT_ROOT } from './project-paths'

export type ContentKind = 'agents' | 'rules' | 'templates' | 'examples'

const SourcesFileSchema = z.object({
  roots: z.array(z.string()).optional().default([]),
  agentsDirs: z.array(z.string()).optional().default([]),
  rulesDirs: z.array(z.string()).optional().default([]),
  templatesDirs: z.array(z.string()).optional().default([]),
  examplesDirs: z.array(z.string()).optional().default([]),
})

type SourcesFile = z.infer<typeof SourcesFileSchema>

function getSourcesJsonPath(): string {
  return path.join(os.homedir(), '.config', 'mantra', 'sources.json')
}

function expandHome(p: string): string {
  const expanded = p.startsWith('~/') || p === '~' ? path.join(os.homedir(), p.slice(2)) : p
  const resolved = path.resolve(expanded)
  const home = os.homedir()

  if (!resolved.startsWith(`${home}/`) && resolved !== home) {
    process.stderr.write(
      `[mantra] warning: sources.json のパスがホームディレクトリ外を指しています: ${resolved}\n`,
    )
  }

  return expanded
}

function loadSourcesFile(): SourcesFile | null {
  const filePath = getSourcesJsonPath()

  if (!fs.existsSync(filePath)) {
    return null
  }

  let raw: string
  try {
    raw = fs.readFileSync(filePath, 'utf8')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new CliError(
      `sources.json の読み込みに失敗しました: ${filePath} (${message})`,
      'E_IO',
      false,
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new CliError(
      `sources.json が不正な JSON です: ${filePath} (${message})`,
      'E_INPUT_INVALID',
      false,
    )
  }

  const result = SourcesFileSchema.safeParse(parsed)
  if (!result.success) {
    throw new CliError(
      `sources.json のスキーマが不正です: ${filePath} (${result.error.message})`,
      'E_INPUT_INVALID',
      false,
    )
  }

  return result.data
}

function kindDirKey(kind: ContentKind): keyof SourcesFile {
  const map: Record<ContentKind, keyof SourcesFile> = {
    agents: 'agentsDirs',
    rules: 'rulesDirs',
    templates: 'templatesDirs',
    examples: 'examplesDirs',
  }
  return map[kind]
}

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

  const sourcesFile = loadSourcesFile()

  if (sourcesFile !== null) {
    // sources.json が存在する場合: roots + kindDirs を使用（env は無視）
    const rootDirs = uniqueExistingDirs(sourcesFile.roots.map(expandHome))
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

    const directKey = kindDirKey(kind)
    const directDirs = uniqueExistingDirs((sourcesFile[directKey] as string[]).map(expandHome))
    for (const dir of directDirs) {
      sources.push({
        kind,
        dir,
        label: `${kind}:user-dir:${dir}`,
        origin: 'user',
      })
    }
  } else {
    // sources.json がない場合: 既存の環境変数ロジック
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
    const names = fs
      .readdirSync(source.dir)
      .slice()
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
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

export function countUserSources(kinds: ContentKind | ContentKind[]): number {
  const targetKinds = Array.isArray(kinds) ? kinds : [kinds]
  const seen = new Set<string>()

  for (const kind of targetKinds) {
    for (const source of resolveContentSources(kind)) {
      if (source.origin !== 'user') {
        continue
      }
      seen.add(source.dir)
    }
  }

  return seen.size
}
