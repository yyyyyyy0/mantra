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
})
