import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { spawnSync, type SpawnSyncReturns } from 'node:child_process'

export interface CliRunResult {
  command: string
  raw: SpawnSyncReturns<string>
  stdout: string
  stderr: string
  jsonLines: Array<Record<string, unknown>>
}

export function createTempHome(prefix = 'mantra-test-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

export function removeTempHome(home: string): void {
  fs.rmSync(home, { recursive: true, force: true })
}

export function runScript(
  scriptFile: string,
  args: string[],
  homeDir: string,
  extraEnv: Record<string, string> = {},
): CliRunResult {
  const repoRoot = process.cwd()
  const tsxBin = path.join(repoRoot, 'node_modules', '.bin', 'tsx')
  const scriptPath = path.join('scripts', scriptFile)
  const command = `${tsxBin} ${scriptPath} ${args.join(' ')}`.trim()

  const raw = spawnSync(tsxBin, [scriptPath, ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: homeDir,
      ...extraEnv,
    },
    encoding: 'utf8',
  })

  const stdout = raw.stdout ?? ''
  const stderr = raw.stderr ?? ''
  const jsonLines = stdout
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('{') && line.endsWith('}'))
    .map(line => JSON.parse(line) as Record<string, unknown>)

  return { command, raw, stdout, stderr, jsonLines }
}

export function runNpmScript(
  scriptName: string,
  homeDir: string,
  scriptArgs: string[] = [],
  extraEnv: Record<string, string> = {},
): CliRunResult {
  const repoRoot = process.cwd()
  const npmArgs = ['run', scriptName]

  if (scriptArgs.length > 0) {
    npmArgs.push('--', ...scriptArgs)
  }

  const command = `npm ${npmArgs.join(' ')}`
  const raw = spawnSync('npm', npmArgs, {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: homeDir,
      ...extraEnv,
    },
    encoding: 'utf8',
  })

  const stdout = raw.stdout ?? ''
  const stderr = raw.stderr ?? ''
  const jsonLines = stdout
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('{') && line.endsWith('}'))
    .map(line => JSON.parse(line) as Record<string, unknown>)

  return { command, raw, stdout, stderr, jsonLines }
}

export function todayMetricsPath(homeDir: string): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return path.join(homeDir, '.mantra', 'metrics', `${y}-${m}-${d}.jsonl`)
}
