import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  type CliErrorCode,
  CliError,
  createMetricSessionId,
  ensureNodeVersion,
  METRIC_SESSION_ID_ENV,
  METRIC_WORKFLOW_ENV,
  metricsDirectoryPath,
  type MetricRecord,
  recordMetric,
  toCliError,
  type WorkflowName,
  writeWarn,
} from './lib/cli-telemetry'

interface OnboardingArgs {
  full: boolean
  json: boolean
}

interface ScriptInvocation {
  script: string
  args: string[]
}

function todayMetricsFilePath(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return path.join(metricsDirectoryPath(), `${y}-${m}-${d}.jsonl`)
}

function readLatestStepErrorCode(sessionId: string): CliErrorCode | undefined {
  const metricsPath = todayMetricsFilePath()
  if (!fs.existsSync(metricsPath)) {
    return undefined
  }

  const lines = fs.readFileSync(metricsPath, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .reverse()

  for (const line of lines) {
    try {
      const record = JSON.parse(line) as MetricRecord
      if (
        record.session_id === sessionId
        && record.record_kind === 'command'
        && record.success === false
        && typeof record.error_code === 'string'
      ) {
        return record.error_code as CliErrorCode
      }
    } catch {
      // Ignore malformed lines; metrics are best-effort.
    }
  }

  return undefined
}

function parseArgs(argv = process.argv): OnboardingArgs {
  return {
    full: argv.includes('--full'),
    json: argv.includes('--json'),
  }
}

function buildSteps(args: OnboardingArgs): ScriptInvocation[] {
  const steps: ScriptInvocation[] = [
    { script: 'setup', args: args.json ? ['--json'] : [] },
    { script: args.json ? 'validate:json' : 'validate', args: [] },
  ]

  if (args.full) {
    steps.push({ script: args.json ? 'sync:codex:json' : 'sync:codex', args: [] })
  }

  return steps
}

function runStep(step: ScriptInvocation, env: NodeJS.ProcessEnv): void {
  const npmArgs = ['run', step.script]

  if (step.args.length > 0) {
    npmArgs.push('--', ...step.args)
  }

  const result = spawnSync('npm', npmArgs, {
    stdio: 'inherit',
    env,
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    throw new CliError(
      `onboarding step failed: npm ${npmArgs.join(' ')}`,
      'E_INTERNAL',
      false,
    )
  }
}

function main(): void {
  const args = parseArgs(process.argv)
  const workflow: WorkflowName = args.full ? 'onboarding:full' : 'onboarding'
  const startedAt = Date.now()
  const sessionId = createMetricSessionId()

  try {
    ensureNodeVersion(20)

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      [METRIC_SESSION_ID_ENV]: sessionId,
      [METRIC_WORKFLOW_ENV]: workflow,
    }

    for (const step of buildSteps(args)) {
      runStep(step, env)
    }

    recordMetric({
      timestamp: new Date().toISOString(),
      command: workflow,
      duration_ms: Date.now() - startedAt,
      success: true,
      warning_count: 0,
      warning_types: [],
      schema_version: 2,
      record_kind: 'workflow',
      session_id: sessionId,
      workflow,
    })
  } catch (error) {
    const cliErr = toCliError(error)
    const workflowErrorCode = readLatestStepErrorCode(sessionId) ?? cliErr.code
    writeWarn(args.json, cliErr.message)
    recordMetric({
      timestamp: new Date().toISOString(),
      command: workflow,
      duration_ms: Date.now() - startedAt,
      success: false,
      error_code: workflowErrorCode,
      warning_count: 0,
      warning_types: [],
      schema_version: 2,
      record_kind: 'workflow',
      session_id: sessionId,
      workflow,
    })
    process.exit(1)
  }
}

main()
