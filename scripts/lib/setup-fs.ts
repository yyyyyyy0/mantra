import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  CliError,
  toCliError,
  writeInfo,
  writeJsonLine,
  writeWarn,
} from './cli-telemetry'

export interface SetupLink {
  src: string
  dest: string
  label: string
}

export type SymlinkResult =
  | { success: true; dest: string; label: string; src: string }
  | {
      success: false
      dest: string
      label: string
      message: string
      errorCode: CliError['code']
      retryable: boolean
    }

export type SymlinkSuccess = Extract<SymlinkResult, { success: true }>
export type SymlinkFailure = Extract<SymlinkResult, { success: false }>

export function pathExists(p: string): boolean {
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

export function buildBackupPath(dest: string, now: Date = new Date()): string {
  const timestamp = formatTimestamp(now)
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

export function prepareDestination(dest: string, label: string, force: boolean, json: boolean): void {
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

export function createSymlink(link: SetupLink, force: boolean, json: boolean): SymlinkResult {
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
