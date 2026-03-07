import * as fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import * as os from 'node:os'
import * as path from 'node:path'

export type CliErrorCode =
  | 'E_ENV_NODE_VERSION'
  | 'E_FS_PERMISSION'
  | 'E_SCHEMA_FRONTMATTER'
  | 'E_SCHEMA_RULE'
  | 'E_FAMILY_DRIFT'
  | 'E_SYNC_OUTPUT_PATH'
  | 'E_INPUT_INVALID'
  | 'E_IO'
  | 'E_INTERNAL'

export type WarningCode = 'W_SOURCE_CONFLICT_FILENAME'
export type WorkflowName = 'onboarding' | 'onboarding:full'
export type MetricRecordKind = 'command' | 'workflow'

export const METRIC_SESSION_ID_ENV = 'MANTRA_METRICS_SESSION_ID'
export const METRIC_WORKFLOW_ENV = 'MANTRA_METRICS_WORKFLOW'

export interface WarningEvent {
  type: 'warning'
  command: string
  code: WarningCode
  winner: 'user' | 'core'
  loser: 'core' | `user:${string}`
  target: string
  message: string
}

export interface WarningDetail {
  code: WarningCode
  target?: string
  winner?: 'user' | 'core'
  loser?: string
}

export class CliError extends Error {
  code: CliErrorCode
  retryable: boolean

  constructor(message: string, code: CliErrorCode, retryable = false) {
    super(message)
    this.name = 'CliError'
    this.code = code
    this.retryable = retryable
  }
}

export interface MetricRecord {
  timestamp: string
  command: string
  duration_ms: number
  success: boolean
  error_code?: CliErrorCode
  warning_count: number
  warning_types: WarningCode[]
  schema_version?: 2
  record_kind?: MetricRecordKind
  session_id?: string
  workflow?: WorkflowName
  user_source_count?: number
  warning_details?: WarningDetail[]
}

interface SummaryPayload {
  type: 'summary'
  command: string
  success: boolean
  duration_ms: number
  error_code?: CliErrorCode
  retryable?: boolean
  details?: Record<string, unknown>
  warning_count?: number
  warning_types?: WarningCode[]
}

export interface MetricContext {
  session_id?: string
  workflow?: WorkflowName
  user_source_count?: number
  warning_details?: WarningDetail[]
}

export function hasJsonFlag(argv = process.argv): boolean {
  return argv.includes('--json')
}

export function writeInfo(json: boolean, message: string): void {
  if (!json) {
    process.stdout.write(`${message}\n`)
  }
}

export function writeWarn(json: boolean, message: string): void {
  if (!json) {
    process.stderr.write(`${message}\n`)
  }
}

export function writeWarningEvent(json: boolean, event: WarningEvent): void {
  if (json) {
    writeJsonLine(json, event as unknown as Record<string, unknown>)
  } else {
    process.stderr.write(`⚠ [${event.code}] ${event.message}\n`)
  }
}

export function writeJsonLine(json: boolean, payload: Record<string, unknown>): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(payload)}\n`)
  }
}

function metricsPathForNow(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return path.join(os.homedir(), '.mantra', 'metrics', `${y}-${m}-${d}.jsonl`)
}

export function metricsDirectoryPath(homeDir = os.homedir()): string {
  return path.join(homeDir, '.mantra', 'metrics')
}

export function recordMetric(record: MetricRecord): void {
  const metricsPath = metricsPathForNow()
  const metricsDir = path.dirname(metricsPath)

  try {
    fs.mkdirSync(metricsDir, { recursive: true })
    fs.appendFileSync(metricsPath, `${JSON.stringify(record)}\n`, 'utf8')
  } catch {
    // Metrics write failures should never block CLI usage.
  }
}

export function createMetricSessionId(): string {
  return randomUUID()
}

let processMetricSessionId: string | undefined

function getMetricSessionId(explicit?: string): string {
  if (typeof explicit === 'string' && explicit.length > 0) {
    return explicit
  }

  const fromEnv = process.env[METRIC_SESSION_ID_ENV]
  if (typeof fromEnv === 'string' && fromEnv.length > 0) {
    return fromEnv
  }

  if (processMetricSessionId === undefined) {
    processMetricSessionId = createMetricSessionId()
  }

  return processMetricSessionId
}

function getWorkflowName(explicit?: WorkflowName): WorkflowName | undefined {
  if (explicit !== undefined) {
    return explicit
  }

  const fromEnv = process.env[METRIC_WORKFLOW_ENV]
  if (fromEnv === 'onboarding' || fromEnv === 'onboarding:full') {
    return fromEnv
  }

  return undefined
}

function toWarningDetails(warnings: WarningEvent[]): WarningDetail[] {
  return warnings.map(warning => ({
    code: warning.code,
    target: warning.target,
    winner: warning.winner,
    loser: warning.loser,
  }))
}

function resolveMetricContext(metricContext: MetricContext | undefined, warnings: WarningEvent[]): Required<Pick<MetricRecord, 'session_id'>> & Omit<MetricContext, 'session_id'> {
  return {
    session_id: getMetricSessionId(metricContext?.session_id),
    workflow: getWorkflowName(metricContext?.workflow),
    user_source_count: metricContext?.user_source_count,
    warning_details: metricContext?.warning_details ?? toWarningDetails(warnings),
  }
}

export function ensureNodeVersion(minMajor: number): void {
  const major = Number(process.versions.node.split('.')[0])
  if (!Number.isInteger(major) || major < minMajor) {
    throw new CliError(
      `Node.js v${minMajor}+ が必要です。現在: v${process.versions.node}`,
      'E_ENV_NODE_VERSION',
      false,
    )
  }
}

export function ensureReadableDirectory(dirPath: string, label: string): void {
  try {
    fs.accessSync(dirPath, fs.constants.R_OK)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new CliError(
      `${label} を読み取れません: ${dirPath} (${message})`,
      'E_FS_PERMISSION',
      false,
    )
  }
}

export function ensureWritableParent(targetPath: string, label: string): void {
  try {
    const parent = path.dirname(targetPath)
    fs.mkdirSync(parent, { recursive: true })
    fs.accessSync(parent, fs.constants.W_OK)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new CliError(
      `${label} の書き込み先が利用できません: ${targetPath} (${message})`,
      'E_FS_PERMISSION',
      false,
    )
  }
}

export function toCliError(err: unknown, fallbackCode: CliErrorCode = 'E_INTERNAL'): CliError {
  if (err instanceof CliError) {
    return err
  }

  const message = err instanceof Error ? err.message : String(err)
  if (message.includes('EACCES') || message.includes('EPERM')) {
    return new CliError(message, 'E_FS_PERMISSION', false)
  }
  if (message.includes('ENOENT') || message.includes('EISDIR')) {
    return new CliError(message, 'E_IO', false)
  }
  return new CliError(message, fallbackCode, false)
}

export function finishCommand(params: {
  command: string
  json: boolean
  startedAt: number
  success: boolean
  error?: CliError
  details?: Record<string, unknown>
  warnings?: WarningEvent[]
  metricContext?: MetricContext
}): void {
  const duration = Date.now() - params.startedAt
  const warnings = params.warnings ?? []
  const warningCodes = [...new Set(warnings.map(w => w.code))]
  const metricContext = resolveMetricContext(params.metricContext, warnings)

  const summary: SummaryPayload = {
    type: 'summary',
    command: params.command,
    success: params.success,
    duration_ms: duration,
    details: params.details,
    ...(params.error && {
      error_code: params.error.code,
      retryable: params.error.retryable,
    }),
    ...(warningCodes.length > 0 && {
      warning_count: warnings.length,
      warning_types: warningCodes,
    }),
  }

  writeJsonLine(params.json, summary as unknown as Record<string, unknown>)

  recordMetric({
    timestamp: new Date().toISOString(),
    command: params.command,
    duration_ms: duration,
    success: params.success,
    error_code: params.error?.code,
    warning_count: warnings.length,
    warning_types: warningCodes,
    schema_version: 2,
    record_kind: 'command',
    session_id: metricContext.session_id,
    workflow: metricContext.workflow,
    user_source_count: metricContext.user_source_count,
    warning_details: metricContext.warning_details,
  })
}
