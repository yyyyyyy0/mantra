import * as os from 'node:os'
import * as path from 'node:path'
import {
  CliError,
  finishCommand,
  ensureNodeVersion,
  ensureReadableDirectory,
  ensureWritableParent,
  toCliError,
  writeWarn,
  writeInfo,
  type WarningEvent,
} from './cli-telemetry'
import { countUserSources, type ContentKind, hasUserSources } from './content-sources'
import {
  buildMergedDirectory,
  coreDirectory,
  hasFamilyDirectories,
  type MergedKindSummary,
} from './setup-merge'
import { createSymlink, type SetupLink, type SymlinkFailure, type SymlinkSuccess } from './setup-fs'
import type { SetupArgs } from './setup-args'

export interface SetupLinkPlan {
  links: SetupLink[]
  mergedKinds: MergedKindSummary[]
  warnings: WarningEvent[]
}

export const SETUP_CORE_NEXT_STEP = 'npm run validate'
export const SETUP_OPTIONAL_NEXT_STEP = 'npm run sync:codex'

export function getSetupSuccessOutputLines(): string[] {
  return [
    'セットアップが完了しました。',
    `Core next step: ${SETUP_CORE_NEXT_STEP}`,
    `Optional next step: ${SETUP_OPTIONAL_NEXT_STEP}`,
  ]
}

export function writeSetupSuccessOutput(json: boolean): void {
  for (const line of getSetupSuccessOutputLines()) {
    writeInfo(json, line)
  }
}

function buildSourceDirectory(json: boolean, kind: ContentKind, mergedKinds: MergedKindSummary[], warnings: WarningEvent[]): string {
  if (!hasUserSources(kind) && !hasFamilyDirectories(kind)) {
    return coreDirectory(kind)
  }

  const merged = buildMergedDirectory(kind, json)
  mergedKinds.push({ kind, files: merged.files, dir: merged.dir })
  warnings.push(...merged.warnings)
  return merged.dir
}

export function buildSetupLinks(json: boolean): SetupLinkPlan {
  const mergedKinds: MergedKindSummary[] = []
  const warnings: WarningEvent[] = []

  const agentsSrc = buildSourceDirectory(json, 'agents', mergedKinds, warnings)
  const rulesSrc = buildSourceDirectory(json, 'rules', mergedKinds, warnings)

  for (const kind of ['templates', 'examples'] as const) {
    if (hasUserSources(kind)) {
      const merged = buildMergedDirectory(kind, json)
      mergedKinds.push({ kind, files: merged.files, dir: merged.dir })
      warnings.push(...merged.warnings)
    }
  }

  return {
    links: [
      {
        src: agentsSrc,
        dest: path.join(os.homedir(), '.claude', 'agents'),
        label: '~/.claude/agents',
      },
      {
        src: rulesSrc,
        dest: path.join(os.homedir(), '.claude', 'rules'),
        label: '~/.claude/rules',
      },
    ],
    mergedKinds,
    warnings,
  }
}

export function runSetup(args: SetupArgs): void {
  const { force, json } = args
  const startedAt = Date.now()
  let userSourceCount = 0

  try {
    ensureNodeVersion(20)
    userSourceCount = countUserSources(['agents', 'rules', 'templates', 'examples'])
    const { links, mergedKinds, warnings } = buildSetupLinks(json)

    for (const link of links) {
      ensureReadableDirectory(link.src, `${link.label} source`)
      ensureWritableParent(link.dest, `${link.label} destination`)
    }

    writeInfo(json, 'mantra セットアップを開始します...\n')

    const results = links.map(link => createSymlink(link, force, json))
    const successes = results.filter((r): r is SymlinkSuccess => r.success)
    const failures = results.filter((r): r is SymlinkFailure => !r.success)

    writeInfo(json, `\n${successes.length}/${links.length} 件のシムリンクを作成しました`)

    if (failures.length > 0) {
      writeInfo(json, '\n次のコマンドで強制上書きできます:')
      writeInfo(json, '  npm run setup -- --force')

      finishCommand({
        command: 'setup',
        json,
        startedAt,
        success: false,
        error: new CliError('セットアップに失敗しました', failures[0].errorCode, failures[0].retryable),
        details: {
          created: successes.length,
          total: links.length,
          merged: mergedKinds,
          failures: failures.map(f => ({
            target: f.label,
            error_code: f.errorCode,
            message: f.message,
          })),
        },
        warnings,
        metricContext: { user_source_count: userSourceCount },
      })
      process.exit(1)
    }

    writeInfo(json, '')
    writeSetupSuccessOutput(json)

    finishCommand({
      command: 'setup',
      json,
      startedAt,
      success: true,
      details: {
        created: successes.length,
        total: links.length,
        merged: mergedKinds,
      },
      warnings,
      metricContext: { user_source_count: userSourceCount },
    })
  } catch (error) {
    const cliErr = toCliError(error)
    writeWarn(json, cliErr.message)
    finishCommand({
      command: 'setup',
      json,
      startedAt,
      success: false,
      error: cliErr,
      metricContext: { user_source_count: userSourceCount },
    })
    process.exit(1)
  }
}
