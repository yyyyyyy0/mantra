import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createTempHome,
  removeTempHome,
  runScript,
  todayMetricsPath,
} from '../helpers/cli-runner'

describe('Onboarding smoke', () => {
  const homes: string[] = []

  afterEach(() => {
    while (homes.length > 0) {
      removeTempHome(homes.pop() as string)
    }
  })

  it('completes setup -> validate flow in a fresh HOME (onboarding core)', () => {
    const home = createTempHome('mantra-smoke-')
    homes.push(home)

    const steps = [
      ['setup.ts', ['--json']],
      ['validate-agents.ts', ['--json']],
      ['validate-rules.ts', ['--json']],
    ] as const

    for (const [script, args] of steps) {
      const result = runScript(script, [...args], home)
      expect(result.raw.status, `${result.command}\n${result.stderr}`).toBe(0)
      const summary = result.jsonLines.find(line => line.type === 'summary')
      expect(summary?.success, `${result.command}\n${result.stdout}`).toBe(true)
    }

    const agentsLink = path.join(home, '.claude', 'agents')
    const rulesLink = path.join(home, '.claude', 'rules')
    expect(fs.lstatSync(agentsLink).isSymbolicLink()).toBe(true)
    expect(fs.lstatSync(rulesLink).isSymbolicLink()).toBe(true)

    const metricsPath = todayMetricsPath(home)
    expect(fs.existsSync(metricsPath)).toBe(true)
    const records = fs
      .readFileSync(metricsPath, 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line) as Record<string, unknown>)
    expect(records.length).toBeGreaterThanOrEqual(steps.length)
    expect(records.some(r => r.command === 'setup')).toBe(true)
  })

  it('completes setup -> validate -> sync flow in a fresh HOME (onboarding:full)', () => {
    const home = createTempHome('mantra-smoke-full-')
    homes.push(home)

    const steps = [
      ['setup.ts', ['--json']],
      ['validate-agents.ts', ['--json']],
      ['validate-rules.ts', ['--json']],
      ['sync-agents-to-codex.ts', ['--json']],
      ['sync-rules-to-codex.ts', ['--json']],
    ] as const

    for (const [script, args] of steps) {
      const result = runScript(script, [...args], home)
      expect(result.raw.status, `${result.command}\n${result.stderr}`).toBe(0)
      const summary = result.jsonLines.find(line => line.type === 'summary')
      expect(summary?.success, `${result.command}\n${result.stdout}`).toBe(true)
    }

    const metricsPath = todayMetricsPath(home)
    expect(fs.existsSync(metricsPath)).toBe(true)
    const records = fs
      .readFileSync(metricsPath, 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line) as Record<string, unknown>)
    expect(records.length).toBeGreaterThanOrEqual(steps.length)
    expect(records.some(r => r.command === 'setup')).toBe(true)
    expect(records.some(r => r.command === 'sync:codex:agents')).toBe(true)
  })

  it('requires --force to overwrite existing destination paths and succeeds with --force', () => {
    const home = createTempHome('mantra-smoke-force-')
    homes.push(home)

    const existingAgents = path.join(home, '.claude', 'agents')
    const existingRules = path.join(home, '.claude', 'rules')
    fs.mkdirSync(existingAgents, { recursive: true })
    fs.mkdirSync(existingRules, { recursive: true })
    fs.writeFileSync(path.join(existingAgents, 'legacy.md'), 'legacy\n', 'utf8')
    fs.writeFileSync(path.join(existingRules, 'legacy.md'), 'legacy\n', 'utf8')

    const forceResult = runScript('setup.ts', ['--json', '--force'], home)
    expect(forceResult.raw.status, `${forceResult.command}\n${forceResult.stderr}`).toBe(0)

    const summary = forceResult.jsonLines.find(line => line.type === 'summary')
    expect(summary?.success).toBe(true)
    expect(fs.lstatSync(existingAgents).isSymbolicLink()).toBe(true)
    expect(fs.lstatSync(existingRules).isSymbolicLink()).toBe(true)

    const claudeDir = path.join(home, '.claude')
    const backupFiles = fs
      .readdirSync(claudeDir)
      .filter(name => name.startsWith('agents.bak-') || name.startsWith('rules.bak-'))
    expect(backupFiles.length).toBeGreaterThan(0)

    const normalResult = runScript('setup.ts', ['--json'], home)
    expect(normalResult.raw.status, `${normalResult.command}\n${normalResult.stderr}`).toBe(1)

    const normalSummary = normalResult.jsonLines.find(line => line.type === 'summary')
    expect(normalSummary?.success).toBe(false)
  })
})
