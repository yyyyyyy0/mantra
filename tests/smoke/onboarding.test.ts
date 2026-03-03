import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createTempHome,
  removeTempHome,
  runNpmScript,
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

    const result = runNpmScript('onboarding', home)
    expect(result.raw.status, `${result.command}\n${result.stderr}`).toBe(0)

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
    expect(records.length).toBeGreaterThanOrEqual(3)
    expect(records.some(r => r.command === 'setup')).toBe(true)
    expect(records.some(r => r.command === 'validate:agents')).toBe(true)
    expect(records.some(r => r.command === 'validate:rules')).toBe(true)
  })

  it('completes setup -> validate -> sync flow in a fresh HOME (onboarding:full)', () => {
    const home = createTempHome('mantra-smoke-full-')
    homes.push(home)

    const result = runNpmScript('onboarding:full', home)
    expect(result.raw.status, `${result.command}\n${result.stderr}`).toBe(0)

    const metricsPath = todayMetricsPath(home)
    expect(fs.existsSync(metricsPath)).toBe(true)
    const records = fs
      .readFileSync(metricsPath, 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line) as Record<string, unknown>)
    expect(records.length).toBeGreaterThanOrEqual(5)
    expect(records.some(r => r.command === 'setup')).toBe(true)
    expect(records.some(r => r.command === 'validate:agents')).toBe(true)
    expect(records.some(r => r.command === 'validate:rules')).toBe(true)
    expect(records.some(r => r.command === 'sync:codex:agents')).toBe(true)
    expect(records.some(r => r.command === 'sync:codex:rules')).toBe(true)
  })
})
