import { spawnSync } from 'node:child_process'
import {
  CliError,
  createMetricSessionId,
  ensureNodeVersion,
  METRIC_SESSION_ID_ENV,
  METRIC_WORKFLOW_ENV,
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
    writeWarn(args.json, cliErr.message)
    recordMetric({
      timestamp: new Date().toISOString(),
      command: workflow,
      duration_ms: Date.now() - startedAt,
      success: false,
      error_code: cliErr.code,
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
