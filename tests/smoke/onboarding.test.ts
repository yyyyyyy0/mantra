import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createTempHome,
  removeTempHome,
  runScript,
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
    expect(records.length).toBeGreaterThanOrEqual(4)
    expect(records.some(r => r.command === 'setup')).toBe(true)
    expect(records.some(r => r.command === 'validate:agents')).toBe(true)
    expect(records.some(r => r.command === 'validate:rules')).toBe(true)
    expect(records.some(r => r.command === 'validate:drift')).toBe(true)
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
    expect(records.length).toBeGreaterThanOrEqual(8)
    expect(records.some(r => r.command === 'setup')).toBe(true)
    expect(records.some(r => r.command === 'validate:agents')).toBe(true)
    expect(records.some(r => r.command === 'validate:rules')).toBe(true)
    expect(records.some(r => r.command === 'validate:drift')).toBe(true)
    expect(records.some(r => r.command === 'sync:codex:agents')).toBe(true)
    expect(records.some(r => r.command === 'sync:codex:rules')).toBe(true)
    expect(records.some(r => r.command === 'sync:codex:templates')).toBe(true)
    expect(records.some(r => r.command === 'sync:codex:examples')).toBe(true)
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
