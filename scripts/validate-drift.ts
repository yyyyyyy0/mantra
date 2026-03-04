import {
  CliError,
  ensureNodeVersion,
  ensureReadableDirectory,
  finishCommand,
  hasJsonFlag,
  toCliError,
  writeInfo,
  writeJsonLine,
  writeWarn,
} from './lib/cli-telemetry'
import { listContentEntries } from './lib/content-entries'
import { resolveContentSources, type ContentKind } from './lib/content-sources'
import { validateSkillFamilyDrift } from './lib/skill-family-drift'
import { selectSummaryErrorCode } from './lib/validation-summary'

const CONTENT_KINDS: ContentKind[] = ['agents', 'rules', 'templates', 'examples']

function main(): void {
  const json = hasJsonFlag(process.argv)
  const startedAt = Date.now()
  const errorCodes: CliError['code'][] = []

  let familiesSeen = 0
  let familiesChecked = 0
  let familiesFailed = 0
  let violationsTotal = 0

  try {
    ensureNodeVersion(20)

    for (const kind of CONTENT_KINDS) {
      const sources = resolveContentSources(kind)
      for (const source of sources) {
        ensureReadableDirectory(source.dir, source.label)
      }

      const listed = listContentEntries(kind, { target: 'claude' })
      for (const entry of listed.entries) {
        if (entry.entryKind !== 'family') {
          continue
        }

        familiesSeen += 1

        const drift = validateSkillFamilyDrift(entry.family)
        if (!drift.enabled) {
          continue
        }

        familiesChecked += 1
        if (drift.violations.length === 0) {
          writeInfo(json, `✓ drift ${kind}/${entry.family.outputName}`)
          writeJsonLine(json, {
            type: 'drift_checked',
            command: 'validate:drift',
            kind,
            file: entry.familyDir,
            source_kind: 'family',
            output_name: entry.family.outputName,
            max_overlay_ratio: drift.maxOverlayRatio,
            checked_targets: drift.checkedTargets,
            success: true,
          })
          continue
        }

        familiesFailed += 1
        violationsTotal += drift.violations.length
        errorCodes.push('E_FAMILY_DRIFT')

        for (const violation of drift.violations) {
          writeWarn(
            json,
            `✗ drift ${kind}/${entry.family.outputName}: ${violation.message}`,
          )
          writeJsonLine(json, {
            type: 'drift_error',
            command: 'validate:drift',
            kind,
            file: entry.familyDir,
            source_kind: 'family',
            output_name: entry.family.outputName,
            target: violation.target,
            message: violation.message,
            error_code: 'E_FAMILY_DRIFT',
            retryable: false,
            violation_code: violation.code,
            details: violation.details,
          })
        }
      }
    }

    if (errorCodes.length > 0) {
      const summaryErrorCode = selectSummaryErrorCode(errorCodes, 'E_SCHEMA_RULE')
      finishCommand({
        command: 'validate:drift',
        json,
        startedAt,
        success: false,
        error: new CliError(
          `${familiesFailed} family drift violation(s) found`,
          summaryErrorCode,
          false,
        ),
        details: {
          families_seen: familiesSeen,
          families_checked: familiesChecked,
          families_failed: familiesFailed,
          violations: violationsTotal,
        },
      })
      process.exit(1)
    }

    writeInfo(
      json,
      `✓ drift validation passed (${familiesChecked} families checked / ${familiesSeen} families seen)`,
    )
    finishCommand({
      command: 'validate:drift',
      json,
      startedAt,
      success: true,
      details: {
        families_seen: familiesSeen,
        families_checked: familiesChecked,
        families_failed: familiesFailed,
        violations: 0,
      },
    })
  } catch (err) {
    const cliErr = toCliError(err, 'E_INTERNAL')
    writeWarn(json, cliErr.message)
    writeJsonLine(json, {
      type: 'drift_error',
      command: 'validate:drift',
      message: cliErr.message,
      error_code: cliErr.code,
      retryable: cliErr.retryable,
    })
    finishCommand({
      command: 'validate:drift',
      json,
      startedAt,
      success: false,
      error: cliErr,
      details: {
        families_seen: familiesSeen,
        families_checked: familiesChecked,
        families_failed: familiesFailed,
      },
    })
    process.exit(1)
  }
}

main()
