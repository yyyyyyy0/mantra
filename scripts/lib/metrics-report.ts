import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  type CliErrorCode,
  metricsDirectoryPath,
  type MetricRecord,
  type WarningCode,
  type WarningDetail,
  type WorkflowName,
} from './cli-telemetry'

export interface NormalizedMetricRecord {
  timestamp: string
  command: string
  duration_ms: number
  success: boolean
  error_code?: CliErrorCode
  warning_count: number
  warning_types: WarningCode[]
  schema_version: 1 | 2
  record_kind: 'command' | 'workflow'
  session_id?: string
  workflow?: WorkflowName
  user_source_count?: number
  warning_details: WarningDetail[]
}

export interface MetricsWindow {
  days: number
  from: string
  to: string
  files_scanned: number
  files_found: number
  records_loaded: number
}

export interface MetricsReport {
  type: 'metrics_report'
  window: MetricsWindow
  workflows: Array<{
    workflow: WorkflowName
    runs: number
    successes: number
    failures: number
    success_rate: number
    p50_duration_ms: number
  }>
  commands: Array<{
    command: string
    runs: number
    successes: number
    failures: number
    success_rate: number
    avg_duration_ms: number
    user_source_runs: number
  }>
  top_error_codes: Array<{
    error_code: CliErrorCode
    count: number
  }>
  top_warning_types: Array<{
    warning_code: WarningCode
    count: number
  }>
  top_conflicts: Array<{
    target: string
    count: number
  }>
  skipped_records: number
}

interface LoadMetricsResult {
  window: MetricsWindow
  records: NormalizedMetricRecord[]
  skippedRecords: number
}

function toDateStamp(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function buildDateWindow(days: number, now: Date): string[] {
  const dates: string[] = []

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(now)
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - offset)
    dates.push(toDateStamp(date))
  }

  return dates
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeWarningDetails(input: unknown): WarningDetail[] {
  if (!Array.isArray(input)) {
    return []
  }

  return input.flatMap(item => {
    if (!isObject(item) || typeof item.code !== 'string') {
      return []
    }

    const detail: WarningDetail = { code: item.code as WarningCode }

    if (typeof item.target === 'string') {
      detail.target = item.target
    }
    if (item.winner === 'user' || item.winner === 'core') {
      detail.winner = item.winner
    }
    if (typeof item.loser === 'string') {
      detail.loser = item.loser
    }

    return [detail]
  })
}

export function normalizeMetricRecord(input: unknown): NormalizedMetricRecord | null {
  if (!isObject(input)) {
    return null
  }

  if (
    typeof input.timestamp !== 'string'
    || typeof input.command !== 'string'
    || typeof input.duration_ms !== 'number'
    || Number.isNaN(input.duration_ms)
    || typeof input.success !== 'boolean'
  ) {
    return null
  }

  const warningCount = typeof input.warning_count === 'number' && input.warning_count >= 0
    ? input.warning_count
    : 0
  const warningTypes = Array.isArray(input.warning_types)
    ? input.warning_types.filter((value): value is WarningCode => typeof value === 'string')
    : []
  const hasRecordKind = Object.hasOwn(input, 'record_kind')

  if (hasRecordKind && input.record_kind !== 'command' && input.record_kind !== 'workflow') {
    return null
  }

  const normalized: NormalizedMetricRecord = {
    timestamp: input.timestamp,
    command: input.command,
    duration_ms: input.duration_ms,
    success: input.success,
    warning_count: warningCount,
    warning_types: warningTypes,
    schema_version: input.schema_version === 2 ? 2 : 1,
    record_kind: input.record_kind === 'workflow' ? 'workflow' : 'command',
    warning_details: normalizeWarningDetails(input.warning_details),
  }

  if (typeof input.error_code === 'string') {
    normalized.error_code = input.error_code as CliErrorCode
  }

  if (normalized.schema_version === 2 || input.record_kind === 'workflow' || input.record_kind === 'command') {
    if (typeof input.session_id !== 'string' || input.session_id.length === 0) {
      return null
    }
    normalized.session_id = input.session_id
  }

  if (input.workflow === 'onboarding' || input.workflow === 'onboarding:full') {
    normalized.workflow = input.workflow
  }

  if (typeof input.user_source_count === 'number' && input.user_source_count >= 0) {
    normalized.user_source_count = input.user_source_count
  }

  return normalized
}

export function loadMetricsWindow(days: number, now = new Date(), homeDir?: string): LoadMetricsResult {
  const dateWindow = buildDateWindow(days, now)
  const from = dateWindow[0] ?? toDateStamp(now)
  const to = dateWindow[dateWindow.length - 1] ?? toDateStamp(now)
  const metricsDir = metricsDirectoryPath(homeDir)

  if (!fs.existsSync(metricsDir) || !fs.statSync(metricsDir).isDirectory()) {
    return {
      window: {
        days,
        from,
        to,
        files_scanned: dateWindow.length,
        files_found: 0,
        records_loaded: 0,
      },
      records: [],
      skippedRecords: 0,
    }
  }

  const files = dateWindow.map(date => path.join(metricsDir, `${date}.jsonl`))
  const records: NormalizedMetricRecord[] = []
  let filesFound = 0
  let skippedRecords = 0

  for (const filePath of files) {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      continue
    }

    filesFound += 1

    const lines = fs.readFileSync(filePath, 'utf8')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as MetricRecord
        const normalized = normalizeMetricRecord(parsed)

        if (normalized === null) {
          skippedRecords += 1
          continue
        }

        records.push(normalized)
      } catch {
        skippedRecords += 1
      }
    }
  }

  return {
    window: {
      days,
      from,
      to,
      files_scanned: dateWindow.length,
      files_found: filesFound,
      records_loaded: records.length,
    },
    records,
    skippedRecords,
  }
}

function roundPercentage(value: number): number {
  return Math.round(value * 10) / 10
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0
  }

  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 1) {
    return sorted[middle] as number
  }

  return Math.round(((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2)
}

function sortByCountAndName<T extends { count: number }>(
  items: T[],
  labelFor: (item: T) => string,
): T[] {
  return items.sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count
    }
    const leftLabel = labelFor(left)
    const rightLabel = labelFor(right)
    return leftLabel < rightLabel ? -1 : leftLabel > rightLabel ? 1 : 0
  })
}

function incrementWarningCounts(
  counts: Map<WarningCode, number>,
  record: NormalizedMetricRecord,
): void {
  // v2 rows preserve per-event warning details; legacy rows can only approximate.
  if (record.warning_details.length > 0) {
    for (const detail of record.warning_details) {
      counts.set(detail.code, (counts.get(detail.code) ?? 0) + 1)
    }
    return
  }

  if (record.warning_types.length === 1 && record.warning_count > 0) {
    const [warningType] = record.warning_types
    if (warningType !== undefined) {
      counts.set(warningType, (counts.get(warningType) ?? 0) + record.warning_count)
    }
    return
  }

  for (const warningType of record.warning_types) {
    counts.set(warningType, (counts.get(warningType) ?? 0) + 1)
  }
}

export function buildMetricsReport(days: number, now = new Date(), homeDir?: string): MetricsReport {
  const { window, records, skippedRecords } = loadMetricsWindow(days, now, homeDir)

  const workflowMap = new Map<WorkflowName, { runs: number; successes: number; durations: number[] }>()
  const commandMap = new Map<string, { runs: number; successes: number; durationTotal: number; userSourceRuns: number }>()
  const errorCounts = new Map<CliErrorCode, number>()
  const warningCounts = new Map<WarningCode, number>()
  const conflictCounts = new Map<string, number>()

  for (const record of records) {
    if (record.error_code !== undefined) {
      errorCounts.set(record.error_code, (errorCounts.get(record.error_code) ?? 0) + 1)
    }

    incrementWarningCounts(warningCounts, record)

    for (const detail of record.warning_details) {
      if (detail.code !== 'W_SOURCE_CONFLICT_FILENAME' || detail.target === undefined) {
        continue
      }

      conflictCounts.set(detail.target, (conflictCounts.get(detail.target) ?? 0) + 1)
    }

    if (record.record_kind === 'workflow') {
      const workflowName = record.workflow
        ?? (record.command === 'onboarding' || record.command === 'onboarding:full' ? record.command : undefined)

      if (workflowName === undefined) {
        continue
      }

      const current = workflowMap.get(workflowName) ?? { runs: 0, successes: 0, durations: [] }
      current.runs += 1
      current.successes += record.success ? 1 : 0
      current.durations.push(record.duration_ms)
      workflowMap.set(workflowName, current)
      continue
    }

    const current = commandMap.get(record.command) ?? {
      runs: 0,
      successes: 0,
      durationTotal: 0,
      userSourceRuns: 0,
    }
    current.runs += 1
    current.successes += record.success ? 1 : 0
    current.durationTotal += record.duration_ms
    current.userSourceRuns += (record.user_source_count ?? 0) > 0 ? 1 : 0
    commandMap.set(record.command, current)
  }

  return {
    type: 'metrics_report',
    window,
    workflows: (['onboarding', 'onboarding:full'] as const)
      .flatMap(workflow => {
        const stats = workflowMap.get(workflow)
        if (stats === undefined) {
          return []
        }

        return [{
          workflow,
          runs: stats.runs,
          successes: stats.successes,
          failures: stats.runs - stats.successes,
          success_rate: roundPercentage((stats.successes / stats.runs) * 100),
          p50_duration_ms: median(stats.durations),
        }]
      }),
    commands: [...commandMap.entries()]
      .map(([command, stats]) => ({
        command,
        runs: stats.runs,
        successes: stats.successes,
        failures: stats.runs - stats.successes,
        success_rate: roundPercentage((stats.successes / stats.runs) * 100),
        avg_duration_ms: Math.round(stats.durationTotal / stats.runs),
        user_source_runs: stats.userSourceRuns,
      }))
      .sort((left, right) => left.command.localeCompare(right.command)),
    top_error_codes: sortByCountAndName(
      [...errorCounts.entries()].map(([error_code, count]) => ({ error_code, count })),
      item => item.error_code,
    ),
    top_warning_types: sortByCountAndName(
      [...warningCounts.entries()].map(([warning_code, count]) => ({ warning_code, count })),
      item => item.warning_code,
    ),
    top_conflicts: sortByCountAndName(
      [...conflictCounts.entries()].map(([target, count]) => ({ target, count })),
      item => item.target,
    ),
    skipped_records: skippedRecords,
  }
}
