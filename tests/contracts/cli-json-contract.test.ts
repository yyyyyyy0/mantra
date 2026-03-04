import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createTempHome,
  removeTempHome,
  runScript,
  todayMetricsPath,
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

  it('emits summary objects for all primary commands', () => {
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

    const metricsPath = todayMetricsPath(home)
    const last = fs
      .readFileSync(metricsPath, 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line) as Record<string, unknown>)
      .at(-1)
    expect(typeof last?.timestamp).toBe('string')
    expect(typeof last?.command).toBe('string')
    expect(typeof last?.duration_ms).toBe('number')
    expect(typeof last?.success).toBe('boolean')
    expect(last?.warning_count).toBe(0)
    expect(last?.warning_types).toEqual([])
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
})
