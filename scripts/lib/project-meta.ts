import * as fs from 'fs'
import { PACKAGE_JSON_PATH } from './project-paths'

const DEFAULT_LICENSE = 'MIT'
const DEFAULT_VERSION = '0.0.0'

export interface ProjectMeta {
  license: string
  version: string
}

let warningShown = false

function warnOnce(message: string): void {
  if (warningShown) {
    return
  }
  process.stderr.write(`WARN: ${message}\n`)
  warningShown = true
}

function readPackageJson(): Record<string, unknown> | null {
  try {
    const raw = fs.readFileSync(PACKAGE_JSON_PATH, 'utf8')
    return JSON.parse(raw) as Record<string, unknown>
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    warnOnce(`package.json を読み込めませんでした (${message})。フォールバック値を使用します。`)
    return null
  }
}

function readStringField(
  pkg: Record<string, unknown> | null,
  key: 'license' | 'version',
  fallback: string,
): string {
  if (!pkg) {
    return fallback
  }

  const value = pkg[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    warnOnce(`package.json に ${key} がありません。フォールバック値を使用します: ${fallback}`)
    return fallback
  }

  return value.trim()
}

export function getProjectMeta(): ProjectMeta {
  const pkg = readPackageJson()
  return {
    license: readStringField(pkg, 'license', DEFAULT_LICENSE),
    version: readStringField(pkg, 'version', DEFAULT_VERSION),
  }
}
