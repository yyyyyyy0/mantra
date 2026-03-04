import * as fs from 'node:fs'
import * as path from 'node:path'
import * as yaml from 'js-yaml'
import { CliError } from './cli-telemetry'
import {
  SkillFamilyFileSchema,
  type SkillFamilyTarget,
} from './skill-family-schema'

const FAMILY_CONFIG = 'family.yml'
const FAMILY_BASE = 'base.md'
const OVERLAYS_DIR = 'overlays'
const FAMILY_SUFFIX = '.family'

export interface SkillFamilyOverlay {
  target: SkillFamilyTarget
  path: string
  content: string
}

export interface LoadedSkillFamily {
  name: string
  dir: string
  basePath: string
  baseContent: string
  overlays: Partial<Record<SkillFamilyTarget, SkillFamilyOverlay>>
}

export interface ComposedSkillFamily {
  content: string
  overlayTarget?: SkillFamilyTarget
}

function readTextFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf8')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new CliError(`family file の読み込みに失敗しました: ${filePath} (${message})`, 'E_IO', false)
  }
}

function ensureFile(filePath: string, label: string): void {
  if (!fs.existsSync(filePath)) {
    throw new CliError(`${label} が見つかりません: ${filePath}`, 'E_INPUT_INVALID', false)
  }

  const stat = fs.statSync(filePath)
  if (!stat.isFile()) {
    throw new CliError(`${label} はファイルである必要があります: ${filePath}`, 'E_INPUT_INVALID', false)
  }
}

function ensureInsideDirectory(baseDir: string, candidate: string): void {
  const normalizedBase = path.resolve(baseDir)
  const normalizedCandidate = path.resolve(candidate)
  if (
    normalizedCandidate !== normalizedBase
    && !normalizedCandidate.startsWith(`${normalizedBase}${path.sep}`)
  ) {
    throw new CliError(
      `family の overlay でディレクトリ外参照はできません: ${candidate}`,
      'E_INPUT_INVALID',
      false,
    )
  }
}

function normalizeOverlayPath(familyDir: string, overlayRef: string): string {
  if (path.isAbsolute(overlayRef)) {
    throw new CliError(
      `family の overlay は相対パスで指定してください: ${overlayRef}`,
      'E_INPUT_INVALID',
      false,
    )
  }

  const normalized = overlayRef.replace(/^\.\//, '')
  const relative = normalized.startsWith(`${OVERLAYS_DIR}/`)
    ? normalized
    : path.posix.join(OVERLAYS_DIR, normalized)

  if (!relative.endsWith('.md')) {
    throw new CliError(
      `family の overlay は .md ファイルである必要があります: ${overlayRef}`,
      'E_INPUT_INVALID',
      false,
    )
  }

  const overlayPath = path.resolve(familyDir, relative)
  ensureInsideDirectory(familyDir, overlayPath)
  ensureFile(overlayPath, 'overlay')
  return overlayPath
}

function parseFamilyConfig(filePath: string): Record<string, string | undefined> {
  const raw = readTextFile(filePath)

  let parsed: unknown
  try {
    parsed = yaml.load(raw, { schema: yaml.DEFAULT_SCHEMA })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new CliError(
      `family.yml が不正な YAML です: ${filePath} (${message})`,
      'E_INPUT_INVALID',
      false,
    )
  }

  const normalized = parsed ?? {}
  const result = SkillFamilyFileSchema.safeParse(normalized)
  if (!result.success) {
    throw new CliError(
      `family.yml のスキーマが不正です: ${filePath} (${result.error.message})`,
      'E_INPUT_INVALID',
      false,
    )
  }

  return result.data.targets
}

export function isSkillFamilyDirectoryName(name: string): boolean {
  return name.endsWith(FAMILY_SUFFIX)
}

export function familyDirectoryToRelativeName(name: string): string {
  if (!isSkillFamilyDirectoryName(name)) {
    throw new CliError(`family ディレクトリ名が不正です: ${name}`, 'E_INPUT_INVALID', false)
  }

  return `${name.slice(0, -FAMILY_SUFFIX.length)}.md`
}

export function loadSkillFamily(familyDir: string): LoadedSkillFamily {
  const resolvedDir = path.resolve(familyDir)
  const familyName = path.basename(resolvedDir)

  if (!isSkillFamilyDirectoryName(familyName)) {
    throw new CliError(
      `family ディレクトリ名は *.family 形式である必要があります: ${familyName}`,
      'E_INPUT_INVALID',
      false,
    )
  }

  if (!fs.existsSync(resolvedDir) || !fs.statSync(resolvedDir).isDirectory()) {
    throw new CliError(`family ディレクトリが見つかりません: ${resolvedDir}`, 'E_INPUT_INVALID', false)
  }

  const configPath = path.join(resolvedDir, FAMILY_CONFIG)
  ensureFile(configPath, 'family.yml')

  const basePath = path.join(resolvedDir, FAMILY_BASE)
  ensureFile(basePath, 'base.md')

  const targets = parseFamilyConfig(configPath)

  const overlays: Partial<Record<SkillFamilyTarget, SkillFamilyOverlay>> = {}
  for (const target of ['claude', 'codex', 'generic'] as const) {
    const ref = targets[target]
    if (!ref) {
      continue
    }

    const overlayPath = normalizeOverlayPath(resolvedDir, ref)
    overlays[target] = {
      target,
      path: overlayPath,
      content: readTextFile(overlayPath),
    }
  }

  return {
    name: familyName.slice(0, -FAMILY_SUFFIX.length),
    dir: resolvedDir,
    basePath,
    baseContent: readTextFile(basePath),
    overlays,
  }
}

function concatenateStatic(baseContent: string, overlayContent: string): string {
  if (overlayContent.length === 0) {
    return baseContent
  }
  if (baseContent.length === 0) {
    return overlayContent
  }

  return `${baseContent}${baseContent.endsWith('\n') ? '' : '\n'}${overlayContent}`
}

export function composeSkillFamily(
  family: LoadedSkillFamily,
  target: SkillFamilyTarget,
): ComposedSkillFamily {
  const direct = family.overlays[target]
  if (direct !== undefined) {
    return {
      content: concatenateStatic(family.baseContent, direct.content),
      overlayTarget: target,
    }
  }

  const generic = family.overlays.generic
  if (generic !== undefined) {
    return {
      content: concatenateStatic(family.baseContent, generic.content),
      overlayTarget: 'generic',
    }
  }

  return {
    content: family.baseContent,
  }
}
