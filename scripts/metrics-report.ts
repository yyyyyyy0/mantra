import { CliError, ensureNodeVersion, hasJsonFlag, toCliError, writeWarn } from './lib/cli-telemetry'
import { buildMetricsReport } from './lib/metrics-report'

function parseDays(argv = process.argv): number {
  const index = argv.indexOf('--days')
  if (index === -1) {
    return 7
  }

  const raw = argv[index + 1]
  const days = Number(raw)

  if (!Number.isInteger(days) || days <= 0) {
    throw new CliError(`--days は 1 以上の整数で指定してください: ${raw ?? '(missing)'}`, 'E_INPUT_INVALID', false)
  }

  return days
}

function writeHumanReport(report: ReturnType<typeof buildMetricsReport>): void {
  process.stdout.write(`Metrics report (${report.window.days} days)\n`)
  process.stdout.write(
    `Window: ${report.window.from} -> ${report.window.to} | files: ${report.window.files_found}/${report.window.files_scanned} | records: ${report.window.records_loaded} | skipped: ${report.skipped_records}\n`,
  )

  if (report.window.records_loaded === 0) {
    process.stdout.write('No metrics found in the selected window.\n')
    return
  }

  process.stdout.write('\nWorkflows\n')
  if (report.workflows.length === 0) {
    process.stdout.write('- none\n')
  } else {
    for (const workflow of report.workflows) {
      process.stdout.write(
        `- ${workflow.workflow}: runs=${workflow.runs}, success=${workflow.success_rate}%, p50=${workflow.p50_duration_ms}ms\n`,
      )
    }
  }

  process.stdout.write('\nCommands\n')
  for (const command of report.commands) {
    process.stdout.write(
      `- ${command.command}: runs=${command.runs}, success=${command.success_rate}%, avg=${command.avg_duration_ms}ms, user-source-runs=${command.user_source_runs}\n`,
    )
  }

  process.stdout.write('\nTop error codes\n')
  if (report.top_error_codes.length === 0) {
    process.stdout.write('- none\n')
  } else {
    for (const item of report.top_error_codes) {
      process.stdout.write(`- ${item.error_code}: ${item.count}\n`)
    }
  }

  process.stdout.write('\nTop warning types\n')
  if (report.top_warning_types.length === 0) {
    process.stdout.write('- none\n')
  } else {
    for (const item of report.top_warning_types) {
      process.stdout.write(`- ${item.warning_code}: ${item.count}\n`)
    }
  }

  process.stdout.write('\nTop conflict targets\n')
  if (report.top_conflicts.length === 0) {
    process.stdout.write('- none\n')
  } else {
    for (const item of report.top_conflicts) {
      process.stdout.write(`- ${item.target}: ${item.count}\n`)
    }
  }
}

function main(): void {
  const json = hasJsonFlag(process.argv)

  try {
    ensureNodeVersion(20)
    const days = parseDays(process.argv)
    const report = buildMetricsReport(days)

    if (json) {
      process.stdout.write(`${JSON.stringify(report)}\n`)
      return
    }

    writeHumanReport(report)
  } catch (error) {
    const cliErr = toCliError(error)
    writeWarn(json, cliErr.message)
    process.exit(1)
  }
}

main()
