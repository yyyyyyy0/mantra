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
import { resolveContentSources } from './lib/content-sources'
import { writeAtomic } from './lib/fs-utils'
import { composeSkillFamily } from './lib/skill-family'

type GenerationTarget = 'claude' | 'codex' | 'generic'

const GENERATION_TARGETS: GenerationTarget[] = ['claude', 'codex', 'generic']

interface TemplateSyncInput {
  name: string
  baseContent: string
  generated: Record<GenerationTarget, string>
  sourceKind: 'legacy' | 'family'
}

function entryToSyncInput(entry: ContentEntry): TemplateSyncInput {
  if (entry.entryKind === 'legacy') {
    const raw = fs.readFileSync(entry.fullPath, 'utf8')
    const name = entry.relativeName.replace(/\.md$/, '')
    return {
      name,
      baseContent: raw,
      generated: {
        claude: raw,
        codex: raw,
        generic: raw,
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
  const outputBase = path.join(os.homedir(), '.codex', 'skills', 'mantra-templates')
  const command = 'sync:codex:templates'

  try {
    ensureNodeVersion(20)

    const sourceDirs = resolveContentSources('templates')
    if (sourceDirs.length === 0) {
      throw new CliError('templates のソースディレクトリが見つかりません', 'E_INPUT_INVALID', false)
    }
    for (const source of sourceDirs) {
      ensureReadableDirectory(source.dir, source.label)
    }

    if (!preview) {
      ensureWritableParent(path.join(outputBase, '.touch'), 'sync destination')
    }

    const listed = listContentEntries('templates', { target: 'codex' })
    const entries = listed.entries
    if (entries.length === 0) {
      throw new CliError('templates のソースファイルが見つかりません', 'E_INPUT_INVALID', false)
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

        if (seenNames.has(input.name)) {
          throw new CliError(
            `重複した template name が見つかりました: ${input.name}`,
            'E_INPUT_INVALID',
            false,
          )
        }
        seenNames.add(input.name)

        if (preview) {
          writeInfo(json, `~ preview ${input.name}`)
          writeJsonLine(json, {
            type: 'preview_base',
            command,
            name: input.name,
            kind: 'templates',
            source_kind: input.sourceKind,
            content: input.baseContent,
          })
          for (const tool of GENERATION_TARGETS) {
            writeJsonLine(json, {
              type: 'preview_generated',
              command,
              name: input.name,
              kind: 'templates',
              source_kind: input.sourceKind,
              tool,
              content: input.generated[tool],
            })
          }
          return { success: true, name: input.name, previewed: true }
        }

        const destPath = path.join(outputBase, input.name, 'SKILL.md')
        writeAtomic(destPath, input.generated.codex, outputBase)

        writeInfo(json, `✓ template ${input.name} → ${destPath}`)
        writeJsonLine(json, {
          type: 'synced',
          command,
          name: input.name,
          dest: destPath,
        })

        return { success: true, name: input.name, dest: destPath, previewed: false }
      } catch (err) {
        const cliErr = toCliError(err, 'E_INPUT_INVALID')
        const code = cliErr.message.includes('パストラバーサル') ? 'E_SYNC_OUTPUT_PATH' : cliErr.code
        const targetFile = entry.entryKind === 'legacy' ? entry.fullPath : entry.familyDir

        writeWarn(json, `✗ ${targetFile}: ${cliErr.message}`)
        writeJsonLine(json, {
          type: 'error',
          command,
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
        command,
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
      })
      process.exit(1)
    }

    finishCommand({
      command,
      json,
      startedAt,
      success: true,
      details: preview
        ? { previewed: previewedCount, total: entries.length }
        : { synced: successes.length, total: entries.length },
    })
  } catch (error) {
    const cliErr = toCliError(error, 'E_INTERNAL')
    writeWarn(json, cliErr.message)
    finishCommand({
      command,
      json,
      startedAt,
      success: false,
      error: cliErr,
    })
    process.exit(1)
  }
}

main()
