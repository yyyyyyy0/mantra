import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  CliError,
  ensureNodeVersion,
  ensureReadableDirectory,
  ensureWritableParent,
  finishCommand,
  hasJsonFlag,
  toCliError,
  writeInfo,
  writeJsonLine,
  writeWarn,
} from './lib/cli-telemetry'
import { listContentEntries, type ContentEntry } from './lib/content-entries'
import { countUserSources, resolveContentSources } from './lib/content-sources'
import { writeAtomic } from './lib/fs-utils'
import { composeSkillFamily } from './lib/skill-family'
import { parseRuleFile } from './lib/rule-parser'

type GenerationTarget = 'claude' | 'codex' | 'generic'

const GENERATION_TARGETS: GenerationTarget[] = ['claude', 'codex', 'generic']

const CLAUDE_RULE_NAME_RE = /^[a-z0-9-]+$/

interface RuleSyncInput {
  name: string
  baseContent: string
  generated: Record<GenerationTarget, string>
  sourceKind: 'legacy' | 'family'
}

function validateRuleName(name: string): void {
  if (!CLAUDE_RULE_NAME_RE.test(name)) {
    throw new CliError(
      `rule name が Claude の命名規則に違反しています（小文字・数字・ハイフンのみ）: ${name}`,
      'E_INPUT_INVALID',
      false,
    )
  }
}

function entryToSyncInput(entry: ContentEntry): RuleSyncInput {
  if (entry.entryKind === 'legacy') {
    const raw = fs.readFileSync(entry.fullPath, 'utf8')
    const { metadata, body } = parseRuleFile(raw, entry.relativeName)
    return {
      name: metadata.name,
      baseContent: body,
      generated: {
        claude: body,
        codex: body,
        generic: body,
      },
      sourceKind: 'legacy',
    }
  }

  const family = entry.family

  return {
    name: family.outputName,
    baseContent: family.baseContent,
    generated: {
      claude: composeSkillFamily(family, 'claude').content,
      codex: composeSkillFamily(family, 'codex').content,
      generic: composeSkillFamily(family, 'generic').content,
    },
    sourceKind: 'family',
  }
}

function main(): void {
  const json = hasJsonFlag(process.argv)
  const preview = process.argv.includes('--preview')
  const startedAt = Date.now()
  const outputBase = path.join(os.homedir(), '.claude', 'rules')
  let userSourceCount = 0

  try {
    ensureNodeVersion(20)
    userSourceCount = countUserSources('rules')

    const sourceDirs = resolveContentSources('rules')
    if (sourceDirs.length === 0) {
      throw new CliError('rules のソースディレクトリが見つかりません', 'E_INPUT_INVALID', false)
    }
    for (const source of sourceDirs) {
      ensureReadableDirectory(source.dir, source.label)
    }

    if (!preview) {
      ensureWritableParent(path.join(outputBase, '.touch'), 'sync destination')
    }

    const listed = listContentEntries('rules', { target: 'claude' })
    const entries = listed.entries
    if (entries.length === 0) {
      throw new CliError('rules のソースファイルが見つかりません', 'E_INPUT_INVALID', false)
    }

    type Result =
      | { success: true; name: string; dest?: string; previewed: boolean }
      | { success: false; file: string; message: string; code: CliError['code']; retryable: boolean }

    type SyncSuccess = Extract<Result, { success: true }>
    type SyncFailure = Extract<Result, { success: false }>

    const seenNames = new Set<string>()

    const results: Result[] = entries.map(entry => {
      try {
        const input = entryToSyncInput(entry)

        validateRuleName(input.name)

        if (seenNames.has(input.name)) {
          throw new CliError(
            `重複した rule name が見つかりました: ${input.name}`,
            'E_INPUT_INVALID',
            false,
          )
        }
        seenNames.add(input.name)

        if (preview) {
          writeInfo(json, `~ preview ${input.name}`)
          writeJsonLine(json, {
            type: 'preview_base',
            command: 'sync:claude:rules',
            name: input.name,
            kind: 'rules',
            source_kind: input.sourceKind,
            content: input.baseContent,
          })
          for (const tool of GENERATION_TARGETS) {
            writeJsonLine(json, {
              type: 'preview_generated',
              command: 'sync:claude:rules',
              name: input.name,
              kind: 'rules',
              source_kind: input.sourceKind,
              tool,
              content: input.generated[tool],
            })
          }
          return { success: true, name: input.name, previewed: true }
        }

        const destPath = path.join(outputBase, `${input.name}.md`)
        writeAtomic(destPath, input.generated.claude, outputBase)

        writeInfo(json, `✓ ${input.name} → ${destPath}`)
        writeJsonLine(json, {
          type: 'synced',
          command: 'sync:claude:rules',
          name: input.name,
          dest: destPath,
        })

        return { success: true, name: input.name, dest: destPath, previewed: false }
      } catch (err) {
        const cliErr = toCliError(err, 'E_SCHEMA_RULE')
        const code = cliErr.message.includes('パストラバーサル') ? 'E_SYNC_OUTPUT_PATH' : cliErr.code
        const targetFile = entry.entryKind === 'legacy' ? entry.fullPath : entry.familyDir

        writeWarn(json, `✗ ${targetFile}: ${cliErr.message}`)
        writeJsonLine(json, {
          type: 'error',
          command: 'sync:claude:rules',
          file: targetFile,
          message: cliErr.message,
          error_code: code,
          retryable: cliErr.retryable,
        })
        return {
          success: false,
          file: targetFile,
          message: cliErr.message,
          code,
          retryable: cliErr.retryable,
        }
      }
    })

    const successes = results.filter((r): r is SyncSuccess => r.success)
    const failures = results.filter((r): r is SyncFailure => !r.success)
    const previewedCount = successes.filter(r => r.previewed).length

    if (preview) {
      writeInfo(json, `\n${previewedCount}/${entries.length} 件をプレビューしました`)
    } else {
      writeInfo(json, `\n${successes.length}/${entries.length} 件を同期しました → ${outputBase}`)
    }

    if (failures.length > 0) {
      finishCommand({
        command: 'sync:claude:rules',
        json,
        startedAt,
        success: false,
        error: new CliError(
          `${failures.length} 件のエラーが発生しました`,
          failures[0].code,
          failures[0].retryable,
        ),
        details: {
          ...(preview ? { previewed: previewedCount } : { synced: successes.length }),
          total: entries.length,
          failures: failures.map(f => ({
            file: f.file,
            error_code: f.code,
            message: f.message,
          })),
        },
        metricContext: { user_source_count: userSourceCount },
      })
      process.exit(1)
    }

    finishCommand({
      command: 'sync:claude:rules',
      json,
      startedAt,
      success: true,
      details: preview
        ? { previewed: previewedCount, total: entries.length }
        : { synced: successes.length, total: entries.length },
      metricContext: { user_source_count: userSourceCount },
    })
  } catch (err) {
    const cliErr = toCliError(err, 'E_INTERNAL')
    writeWarn(json, cliErr.message)
    finishCommand({
      command: 'sync:claude:rules',
      json,
      startedAt,
      success: false,
      error: cliErr,
      metricContext: { user_source_count: userSourceCount },
    })
    process.exit(1)
  }
}

main()
