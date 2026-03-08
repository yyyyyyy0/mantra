import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createTempHome,
  removeTempHome,
  readTodayMetricRecords,
  runNpmScript,
  runScript,
} from '../helpers/cli-runner'

function expectSummaryShape(summary: Record<string, unknown> | undefined): void {
  expect(summary).toBeDefined()
  expect(summary?.type).toBe('summary')
  expect(typeof summary?.command).toBe('string')
  expect(typeof summary?.success).toBe('boolean')
  expect(typeof summary?.duration_ms).toBe('number')
}

describe.sequential('CLI JSON contract', () => {
  const homes: string[] = []

  afterEach(() => {
    while (homes.length > 0) {
      removeTempHome(homes.pop() as string)
    }
  })

  it('emits summary objects for all primary commands', { timeout: 20_000 }, () => {
    const home = createTempHome('mantra-contract-')
    homes.push(home)

    const scripts = [
      'setup.ts',
      'validate-agents.ts',
      'validate-rules.ts',
      'validate-drift.ts',
      'sync-agents-to-codex.ts',
      'sync-rules-to-codex.ts',
      'sync-templates-to-codex.ts',
      'sync-examples-to-codex.ts',
    ] as const

    for (const script of scripts) {
      const result = runScript(script, ['--json'], home)
      expect(result.raw.status, `${result.command}\n${result.stderr}`).toBe(0)
      const summary = result.jsonLines.find(line => line.type === 'summary')
      expectSummaryShape(summary)
      expect(summary?.success).toBe(true)
    }

    const last = readTodayMetricRecords(home).at(-1)
    expect(typeof last?.timestamp).toBe('string')
    expect(typeof last?.command).toBe('string')
    expect(typeof last?.duration_ms).toBe('number')
    expect(typeof last?.success).toBe('boolean')
    expect(last?.schema_version).toBe(2)
    expect(last?.record_kind).toBe('command')
    expect(typeof last?.session_id).toBe('string')
    expect(last?.warning_count).toBe(0)
    expect(last?.warning_types).toEqual([])
    expect(last?.user_source_count).toBe(0)
    expect(last?.warning_details).toEqual([])
  })

  it('emits preview events and summary preview counts for sync preview mode', () => {
    const home = createTempHome('mantra-contract-preview-')
    homes.push(home)

    const result = runScript('sync-agents-to-codex.ts', ['--json', '--preview'], home)
    expect(result.raw.status, `${result.command}\n${result.stderr}`).toBe(0)

    const previewBaseLines = result.jsonLines.filter(line => line.type === 'preview_base')
    const previewGeneratedLines = result.jsonLines.filter(line => line.type === 'preview_generated')

    expect(previewBaseLines.length).toBeGreaterThan(0)
    expect(previewGeneratedLines.length).toBe(previewBaseLines.length * 3)

    const generatedTools = new Set(
      previewGeneratedLines
        .map(line => line.tool)
        .filter((tool): tool is string => typeof tool === 'string'),
    )
    expect(generatedTools).toEqual(new Set(['claude', 'codex', 'generic']))
    expect(
      previewGeneratedLines.every(
        line => line.kind === 'agents' && (line.source_kind === 'legacy' || line.source_kind === 'family'),
      ),
    ).toBe(true)

    const summary = result.jsonLines.find(line => line.type === 'summary')
    expectSummaryShape(summary)
    expect(summary?.success).toBe(true)
    const details = summary?.details as Record<string, unknown> | undefined
    expect(details?.previewed).toBe(previewBaseLines.length)
    expect(details?.total).toBe(previewBaseLines.length)
  })

  it('returns E_SCHEMA_FRONTMATTER for malformed agent file', () => {
    const home = createTempHome('mantra-contract-err-')
    homes.push(home)
    const tempAgentsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mantra-invalid-agents-'))
    const tempAgentFile = path.join(tempAgentsDir, 'tmp-invalid-agent.md')

    try {
      fs.writeFileSync(tempAgentFile, '# invalid file\n', 'utf8')
      const result = runScript(
        'validate-agents.ts',
        ['--json'],
        home,
        { MANTRA_USER_AGENTS_DIRS: tempAgentsDir },
      )
      expect(result.raw.status).toBe(1)

      const errorLine = result.jsonLines.find(line => line.type === 'error')
      expect(errorLine?.error_code).toBe('E_SCHEMA_FRONTMATTER')

      const summary = result.jsonLines.find(line => line.type === 'summary')
      expectSummaryShape(summary)
      expect(summary?.success).toBe(false)
      expect(summary?.error_code).toBe('E_SCHEMA_FRONTMATTER')
    } finally {
      fs.rmSync(tempAgentsDir, { recursive: true, force: true })
    }
  })

  it('stores warning_details for setup filename conflicts', () => {
    const home = createTempHome('mantra-contract-warning-details-')
    homes.push(home)
    const tempAgentsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mantra-warning-agents-'))

    try {
      fs.writeFileSync(
        path.join(tempAgentsDir, 'planner.md'),
        '---\nname: planner\ndescription: Conflict\ntools: []\n---\nBody\n',
        'utf8',
      )

      const result = runScript(
        'setup.ts',
        ['--json'],
        home,
        { MANTRA_USER_AGENTS_DIRS: tempAgentsDir },
      )

      expect(result.raw.status, `${result.command}\n${result.stderr}`).toBe(0)

      const setupMetric = readTodayMetricRecords(home)
        .find(record => record.command === 'setup' && record.record_kind === 'command')

      expect(setupMetric?.warning_types).toEqual(['W_SOURCE_CONFLICT_FILENAME'])
      expect(Array.isArray(setupMetric?.warning_details)).toBe(true)
      expect((setupMetric?.warning_details as Array<Record<string, unknown>>)[0]).toMatchObject({
        code: 'W_SOURCE_CONFLICT_FILENAME',
        target: 'planner.md',
        winner: 'user',
        loser: 'core',
      })
    } finally {
      fs.rmSync(tempAgentsDir, { recursive: true, force: true })
    }
  })

  it('emits a final workflow summary for onboarding wrappers', { timeout: 20_000 }, () => {
    const scripts = [
      { script: 'onboarding:json', command: 'onboarding', steps: ['setup', 'validate'], full: false },
      { script: 'onboarding:full:json', command: 'onboarding:full', steps: ['setup', 'validate', 'sync'], full: true },
    ] as const

    for (const item of scripts) {
      const home = createTempHome('mantra-contract-onboarding-')
      homes.push(home)
      const result = runNpmScript(item.script, home)
      expect(result.raw.status, `${result.command}\n${result.stderr}`).toBe(0)

      const summary = result.jsonLines.at(-1)
      expectSummaryShape(summary)
      expect(summary?.command).toBe(item.command)
      expect(summary?.success).toBe(true)
      expect(summary?.details).toEqual({
        steps: item.steps,
        full: item.full,
      })
    }
  })

  it('emits a failing workflow summary for onboarding json mode with child error_code', () => {
    const home = createTempHome('mantra-contract-onboarding-error-')
    homes.push(home)
    const tempAgentsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mantra-invalid-onboarding-agents-'))

    try {
      fs.writeFileSync(path.join(tempAgentsDir, 'broken.md'), '# invalid file\n', 'utf8')

      const result = runNpmScript(
        'onboarding:json',
        home,
        [],
        { MANTRA_USER_AGENTS_DIRS: tempAgentsDir },
      )

      expect(result.raw.status, `${result.command}\n${result.stderr}`).toBe(1)

      const summary = result.jsonLines.at(-1)
      expectSummaryShape(summary)
      expect(summary?.command).toBe('onboarding')
      expect(summary?.success).toBe(false)
      expect(summary?.error_code).toBe('E_SCHEMA_FRONTMATTER')
      expect(summary?.retryable).toBe(false)
      expect(summary?.details).toEqual({
        steps: ['setup', 'validate'],
        full: false,
      })
    } finally {
      fs.rmSync(tempAgentsDir, { recursive: true, force: true })
    }
  })
})
