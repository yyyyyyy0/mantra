import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as yaml from 'js-yaml'
import { buildSkillContent, CodexFrontmatter } from './lib/codex-utils'
import { writeAtomic } from './lib/fs-utils'
import { ClaudeAgentFrontmatter } from './lib/agent-schema'
import { getProjectMeta } from './lib/project-meta'
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

type AgentFrontmatter = typeof ClaudeAgentFrontmatter._output

// ────────────────────────────────────────────────────────────
// カテゴリマッピング
// ────────────────────────────────────────────────────────────

const CATEGORY_MAP: Record<string, string> = {
  planner: 'planning',
  architect: 'architecture',
  'tdd-guide': 'testing',
  'code-reviewer': 'review',
  'security-reviewer': 'security',
  'build-error-resolver': 'build',
  'e2e-runner': 'testing',
  'mob-navigator': 'planning',
  'mob-critic': 'review',
  'mob-scribe': 'documentation',
  'refactor-cleaner': 'refactoring',
  'doc-updater': 'documentation',
}

function inferCategory(name: string): string {
  return CATEGORY_MAP[name] ?? 'development'
}

// ────────────────────────────────────────────────────────────
// パーサー
// ────────────────────────────────────────────────────────────

interface ParsedAgent {
  frontmatter: AgentFrontmatter
  body: string
}

function parseAgentFile(content: string): ParsedAgent {
  const DELIMITER = '---'
  const lines = content.split('\n')

  if (lines[0] !== DELIMITER) {
    throw new Error('フロントマターが見つかりません（先頭に --- がありません）')
  }

  const endIndex = lines.indexOf(DELIMITER, 1)
  if (endIndex === -1) {
    throw new Error('フロントマターの終端 --- が見つかりません')
  }

  const rawYaml = lines.slice(1, endIndex).join('\n')
  const parsed = yaml.load(rawYaml, { schema: yaml.DEFAULT_SCHEMA })
  const frontmatter = ClaudeAgentFrontmatter.parse(parsed)
  const body = lines.slice(endIndex + 1).join('\n').trimStart()

  return { frontmatter, body }
}

// ────────────────────────────────────────────────────────────
// 変換
// ────────────────────────────────────────────────────────────

function convertFrontmatter(
  src: AgentFrontmatter,
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
  const outputBase = path.join(os.homedir(), '.codex', 'skills', 'mantra')
  try {
    ensureNodeVersion(20)
    const sourceDirs = resolveContentSources('agents')
    if (sourceDirs.length === 0) {
      throw new CliError('agents のソースディレクトリが見つかりません', 'E_INPUT_INVALID', false)
    }
    for (const source of sourceDirs) {
      ensureReadableDirectory(source.dir, source.label)
    }
    ensureWritableParent(path.join(outputBase, '.touch'), 'sync destination')
    const projectMeta = getProjectMeta()

    const files = listContentFiles('agents')
    if (files.length === 0) {
      throw new CliError('agents のソースファイルが見つかりません', 'E_INPUT_INVALID', false)
    }

    type Result =
      | { success: true; name: string; dest: string }
      | { success: false; file: string; message: string; code: CliError['code']; retryable: boolean }

    type SyncSuccess = Extract<Result, { success: true }>
    type SyncFailure = Extract<Result, { success: false }>

    const seenAgentNames = new Set<string>()

    const results: Result[] = files.map(file => {
      try {
        const content = fs.readFileSync(file.fullPath, 'utf8')
        const { frontmatter, body } = parseAgentFile(content)
        if (seenAgentNames.has(frontmatter.name)) {
          throw new CliError(
            `重複した agent name が見つかりました: ${frontmatter.name}`,
            'E_INPUT_INVALID',
            false,
          )
        }
        seenAgentNames.add(frontmatter.name)
        const codexFm = convertFrontmatter(
          frontmatter,
          projectMeta.version,
          projectMeta.license,
        )
        const skillContent = buildSkillContent(codexFm, body)

        const destPath = path.join(outputBase, frontmatter.name, 'SKILL.md')
        writeAtomic(destPath, skillContent, outputBase)

        writeInfo(json, `✓ ${frontmatter.name} → ${destPath}`)
        writeJsonLine(json, {
          type: 'synced',
          command: 'sync:codex:agents',
          name: frontmatter.name,
          dest: destPath,
        })
        return { success: true, name: frontmatter.name, dest: destPath }
      } catch (err) {
        const cliErr = toCliError(err, 'E_SCHEMA_FRONTMATTER')
        const code =
          cliErr.message.includes('パストラバーサル')
            ? 'E_SYNC_OUTPUT_PATH'
            : cliErr.code
        writeWarn(json, `✗ ${file}: ${cliErr.message}`)
        writeJsonLine(json, {
          type: 'error',
          command: 'sync:codex:agents',
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
        command: 'sync:codex:agents',
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
      command: 'sync:codex:agents',
      json,
      startedAt,
      success: true,
      details: { synced: successes.length, total: files.length },
    })
  } catch (err) {
    const cliErr = toCliError(err, 'E_INTERNAL')
    writeWarn(json, cliErr.message)
    finishCommand({
      command: 'sync:codex:agents',
      json,
      startedAt,
      success: false,
      error: cliErr,
    })
    process.exit(1)
  }
}

main()
