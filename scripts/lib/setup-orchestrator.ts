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
import { type ContentKind, hasUserSources } from './content-sources'
import {
  buildMergedDirectory,
  coreDirectory,
  type MergedKindSummary,
} from './setup-merge'
import { createSymlink, type SetupLink, type SymlinkFailure, type SymlinkSuccess } from './setup-fs'
import type { SetupArgs } from './setup-args'

export interface SetupLinkPlan {
  links: SetupLink[]
  mergedKinds: MergedKindSummary[]
  warnings: WarningEvent[]
}

function buildSourceDirectory(json: boolean, kind: ContentKind, mergedKinds: MergedKindSummary[], warnings: WarningEvent[]): string {
  if (!hasUserSources(kind)) {
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

  try {
    ensureNodeVersion(20)
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
      })
      process.exit(1)
    }

    writeInfo(json, '\nセットアップが完了しました。')
    writeInfo(json, '次のステップ: npm run sync:codex')

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
    })
    process.exit(1)
  }
}
