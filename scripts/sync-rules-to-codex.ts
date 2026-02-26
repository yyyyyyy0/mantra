import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { buildSkillContent, CodexFrontmatter } from './lib/codex-utils'
import { writeAtomic } from './lib/fs-utils'
import { getProjectMeta } from './lib/project-meta'
import { parseRuleFile } from './lib/rule-parser'
import type { ParsedRule } from './lib/rule-parser'
import { listContentFiles, resolveContentSources } from './lib/content-sources'
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

type RuleMetadataType = ParsedRule['metadata']

// ────────────────────────────────────────────────────────────
// カテゴリマッピング
// ────────────────────────────────────────────────────────────

const CATEGORY_MAP: Record<string, string> = {
  'coding-style': 'style',
  'git-workflow': 'workflow',
  testing: 'testing',
  performance: 'performance',
  patterns: 'patterns',
  hooks: 'tooling',
  agents: 'orchestration',
  security: 'security',
}

function inferCategory(name: string): string {
  return CATEGORY_MAP[name] ?? 'development'
}

// ────────────────────────────────────────────────────────────
// 変換
// ────────────────────────────────────────────────────────────

function convertToCodexFrontmatter(
  src: RuleMetadataType,
  metadataVersion: string,
  metadataLicense: string,
): CodexFrontmatter {
  return {
    name: src.name,
    description: src.description,
    license: metadataLicense,
    compatibility: 'Works with any codebase',
    metadata: {
      author: 'mantra-project',
      version: metadataVersion,
      category: inferCategory(src.name),
      tags: ['claude-code', src.name],
    },
  }
}


// ────────────────────────────────────────────────────────────
// メイン
// ────────────────────────────────────────────────────────────

function main(): void {
  const json = hasJsonFlag(process.argv)
  const startedAt = Date.now()
  const outputBase = path.join(os.homedir(), '.codex', 'skills', 'mantra-rules')
  try {
    ensureNodeVersion(20)
    const sourceDirs = resolveContentSources('rules')
    if (sourceDirs.length === 0) {
      throw new CliError('rules のソースディレクトリが見つかりません', 'E_INPUT_INVALID', false)
    }
    for (const source of sourceDirs) {
      ensureReadableDirectory(source.dir, source.label)
    }
    ensureWritableParent(path.join(outputBase, '.touch'), 'sync destination')
    const projectMeta = getProjectMeta()

    const files = listContentFiles('rules')
    if (files.length === 0) {
      throw new CliError('rules のソースファイルが見つかりません', 'E_INPUT_INVALID', false)
    }

    type Result =
      | { success: true; name: string; dest: string }
      | { success: false; file: string; message: string; code: CliError['code']; retryable: boolean }

    type SyncSuccess = Extract<Result, { success: true }>
    type SyncFailure = Extract<Result, { success: false }>

    const seenRuleNames = new Set<string>()

    const results: Result[] = files.map(file => {
      try {
        const content = fs.readFileSync(file.fullPath, 'utf8')
        const { metadata, body } = parseRuleFile(content, file.relativeName)
        if (seenRuleNames.has(metadata.name)) {
          throw new CliError(
            `重複した rule name が見つかりました: ${metadata.name}`,
            'E_INPUT_INVALID',
            false,
          )
        }
        seenRuleNames.add(metadata.name)
        const codexFm = convertToCodexFrontmatter(
          metadata,
          projectMeta.version,
          projectMeta.license,
        )
        const skillContent = buildSkillContent(codexFm, body)

        const destPath = path.join(outputBase, metadata.name, 'SKILL.md')
        writeAtomic(destPath, skillContent, outputBase)

        writeInfo(json, `✓ ${metadata.name} → ${destPath}`)
        writeJsonLine(json, {
          type: 'synced',
          command: 'sync:codex:rules',
          name: metadata.name,
          dest: destPath,
        })
        return { success: true, name: metadata.name, dest: destPath }
      } catch (err) {
        const cliErr = toCliError(err, 'E_SCHEMA_RULE')
        const code =
          cliErr.message.includes('パストラバーサル')
            ? 'E_SYNC_OUTPUT_PATH'
            : cliErr.code
        writeWarn(json, `✗ ${file}: ${cliErr.message}`)
        writeJsonLine(json, {
          type: 'error',
          command: 'sync:codex:rules',
          file: file.fullPath,
          message: cliErr.message,
          error_code: code,
          retryable: cliErr.retryable,
        })
        return {
          success: false,
          file: file.fullPath,
          message: cliErr.message,
          code,
          retryable: cliErr.retryable,
        }
      }
    })

    const successes = results.filter((r): r is SyncSuccess => r.success)
    const failures = results.filter((r): r is SyncFailure => !r.success)

    writeInfo(json, `\n${successes.length}/${files.length} 件を同期しました → ${outputBase}`)

    if (failures.length > 0) {
      finishCommand({
        command: 'sync:codex:rules',
        json,
        startedAt,
        success: false,
        error: new CliError(
          `${failures.length} 件のエラーが発生しました`,
          failures[0].code,
          failures[0].retryable,
        ),
        details: {
          synced: successes.length,
          total: files.length,
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
      command: 'sync:codex:rules',
      json,
      startedAt,
      success: true,
      details: { synced: successes.length, total: files.length },
    })
  } catch (err) {
    const cliErr = toCliError(err, 'E_INTERNAL')
    writeWarn(json, cliErr.message)
    finishCommand({
      command: 'sync:codex:rules',
      json,
      startedAt,
      success: false,
      error: cliErr,
    })
    process.exit(1)
  }
}

try {
  main()
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
}
