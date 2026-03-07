import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createTempHome, removeTempHome, runNpmScript } from '../helpers/cli-runner'

function writeMetricsFile(home: string, filename: string, lines: string[]): void {
  const metricsDir = path.join(home, '.mantra', 'metrics')
  fs.mkdirSync(metricsDir, { recursive: true })
  fs.writeFileSync(path.join(metricsDir, filename), `${lines.join('\n')}\n`, 'utf8')
}

function currentMetricsDateStamp(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

describe('metrics report contract', () => {
  const homes: string[] = []

  afterEach(() => {
    while (homes.length > 0) {
      removeTempHome(homes.pop() as string)
    }
  })

  it('returns a stable json object for empty metrics directories', () => {
    const home = createTempHome('mantra-metrics-empty-')
    homes.push(home)

    const result = runNpmScript('metrics:report', home, ['--json'])
    expect(result.raw.status, `${result.command}\n${result.stderr}`).toBe(0)

    const report = result.jsonLines[0]
    expect(report?.type).toBe('metrics_report')
    expect(report?.window).toBeDefined()
    expect(report?.workflows).toEqual([])
    expect(report?.commands).toEqual([])
    expect(report?.top_error_codes).toEqual([])
    expect(report?.top_warning_types).toEqual([])
    expect(report?.top_conflicts).toEqual([])
    expect(report?.skipped_records).toBe(0)
  })

  it('parses mixed v1/v2 records and skips malformed lines without failing', () => {
    const home = createTempHome('mantra-metrics-mixed-')
    homes.push(home)
    const dateStamp = currentMetricsDateStamp()

    writeMetricsFile(home, `${dateStamp}.jsonl`, [
      JSON.stringify({
        timestamp: `${dateStamp}T00:00:00.000Z`,
        command: 'validate:agents',
        duration_ms: 10,
        success: true,
        warning_count: 0,
        warning_types: [],
      }),
      JSON.stringify({
        timestamp: `${dateStamp}T00:01:00.000Z`,
        command: 'setup',
        duration_ms: 25,
        success: true,
        warning_count: 3,
        warning_types: ['W_SOURCE_CONFLICT_FILENAME'],
        schema_version: 2,
        record_kind: 'command',
        session_id: 'session-1',
        workflow: 'onboarding',
        user_source_count: 2,
        warning_details: [
          {
            code: 'W_SOURCE_CONFLICT_FILENAME',
            target: 'planner.md',
            winner: 'user',
            loser: 'core',
          },
          {
            code: 'W_SOURCE_CONFLICT_FILENAME',
            target: 'planner.md',
            winner: 'user',
            loser: 'core',
          },
          {
            code: 'W_SOURCE_CONFLICT_FILENAME',
            target: 'planner.md',
            winner: 'user',
            loser: 'core',
          },
        ],
      }),
      JSON.stringify({
        timestamp: `${dateStamp}T00:01:30.000Z`,
        command: 'setup',
        duration_ms: 15,
        success: true,
        warning_count: 2,
        warning_types: ['W_SOURCE_CONFLICT_FILENAME'],
      }),
      JSON.stringify({
        timestamp: `${dateStamp}T00:02:00.000Z`,
        command: 'onboarding',
        duration_ms: 50,
        success: true,
        warning_count: 0,
        warning_types: [],
        schema_version: 2,
        record_kind: 'workflow',
        session_id: 'session-1',
        workflow: 'onboarding',
      }),
      '{ bad json',
      JSON.stringify({
        timestamp: `${dateStamp}T00:03:00.000Z`,
        command: 'broken',
        duration_ms: 'nope',
        success: true,
      }),
      JSON.stringify({
        timestamp: `${dateStamp}T00:04:00.000Z`,
        command: 'typo-kind',
        duration_ms: 5,
        success: true,
        warning_count: 0,
        warning_types: [],
        schema_version: 2,
        record_kind: 'commnad',
        session_id: 'session-typo',
      }),
    ])

    const result = runNpmScript('metrics:report', home, ['--json'])
    expect(result.raw.status, `${result.command}\n${result.stderr}`).toBe(0)

    const report = result.jsonLines[0] as Record<string, unknown>
    expect(report.type).toBe('metrics_report')
    expect(report.skipped_records).toBe(3)

    const workflows = report.workflows as Array<Record<string, unknown>>
    expect(workflows).toEqual([
      {
        workflow: 'onboarding',
        runs: 1,
        successes: 1,
        failures: 0,
        success_rate: 100,
        p50_duration_ms: 50,
      },
    ])

    const commands = report.commands as Array<Record<string, unknown>>
    expect(commands).toEqual([
      {
        command: 'setup',
        runs: 2,
        successes: 2,
        failures: 0,
        success_rate: 100,
        avg_duration_ms: 20,
        user_source_runs: 1,
      },
      {
        command: 'validate:agents',
        runs: 1,
        successes: 1,
        failures: 0,
        success_rate: 100,
        avg_duration_ms: 10,
        user_source_runs: 0,
      },
    ])

    expect(report.top_warning_types).toEqual([
      { warning_code: 'W_SOURCE_CONFLICT_FILENAME', count: 5 },
    ])
    expect(report.top_conflicts).toEqual([
      { target: 'planner.md', count: 3 },
    ])
  })
})
