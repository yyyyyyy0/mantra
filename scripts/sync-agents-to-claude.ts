import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as yaml from 'js-yaml'
import { ClaudeAgentFrontmatter } from './lib/agent-schema'
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
import { buildSkillContent, type CodexFrontmatter } from './lib/codex-utils'
import { writeAtomic } from './lib/fs-utils'
import { getProjectMeta } from './lib/project-meta'
import { composeSkillFamily } from './lib/skill-family'

type AgentFrontmatter = typeof ClaudeAgentFrontmatter._output
type GenerationTarget = 'claude' | 'codex' | 'generic'

const GENERATION_TARGETS: GenerationTarget[] = ['claude', 'codex', 'generic']

interface AgentSyncInput {
  name: string
  description: string
  tools: string[]
  model?: string
  baseContent: string
  generated: Record<GenerationTarget, string>
  sourceKind: 'legacy' | 'family'
}

const CATEGORY_MAP: Record<string, string> = {
  planner: 'planning',
  replan: 'planning',
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

interface ParsedAgent {
  frontmatter: AgentFrontmatter
  body: string
}

function parseAgentFile(content: string): ParsedAgent {
  const DELIMITER = '---'
  const lines = content.split('\n')

  if (lines[0] !== DELIMITER) {
    throw new CliError('フロントマターが見つかりません（先頭に --- がありません）', 'E_SCHEMA_FRONTMATTER', false)
  }

  const endIndex = lines.indexOf(DELIMITER, 1)
  if (endIndex === -1) {
    throw new CliError('フロントマターの終端 --- が見つかりません', 'E_SCHEMA_FRONTMATTER', false)
  }

  const rawYaml = lines.slice(1, endIndex).join('\n')
  const parsed = yaml.load(rawYaml, { schema: yaml.DEFAULT_SCHEMA })
  const frontmatter = ClaudeAgentFrontmatter.parse(parsed)
  const body = lines.slice(endIndex + 1).join('\n').trimStart()

  return { frontmatter, body }
}

function convertFrontmatter(
  src: Pick<AgentFrontmatter, 'name' | 'description'>,
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

function entryToSyncInput(entry: ContentEntry): AgentSyncInput {
  if (entry.entryKind === 'legacy') {
    const raw = fs.readFileSync(entry.fullPath, 'utf8')
    const parsed = parseAgentFile(raw)
    return {
      name: parsed.frontmatter.name,
      description: parsed.frontmatter.description,
      tools: parsed.frontmatter.tools,
      model: parsed.frontmatter.model,
      baseContent: parsed.body,
      generated: {
        claude: parsed.body,
        codex: parsed.body,
        generic: parsed.body,
      },
      sourceKind: 'legacy',
    }
  }

  const family = entry.family
  if ((family.description ?? '').trim().length === 0) {
    throw new CliError(
      `agents family では description が必須です: ${family.configPath}`,
      'E_INPUT_INVALID',
      false,
    )
  }

  return {
    name: family.outputName,
    description: family.description as string,
    tools: family.tools,
    model: family.model,
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
  const outputBase = path.join(os.homedir(), '.claude', 'skills', 'mantra')
  let userSourceCount = 0

  try {
    ensureNodeVersion(20)
    userSourceCount = countUserSources('agents')

    const sourceDirs = resolveContentSources('agents')
    if (sourceDirs.length === 0) {
      throw new CliError('agents のソースディレクトリが見つかりません', 'E_INPUT_INVALID', false)
    }
    for (const source of sourceDirs) {
      ensureReadableDirectory(source.dir, source.label)
    }

    if (!preview) {
      ensureWritableParent(path.join(outputBase, '.touch'), 'sync destination')
    }

    const projectMeta = getProjectMeta()
    const listed = listContentEntries('agents', { target: 'claude' })
    const entries = listed.entries
    if (entries.length === 0) {
      throw new CliError('agents のソースファイルが見つかりません', 'E_INPUT_INVALID', false)
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
            `重複した agent name が見つかりました: ${input.name}`,
            'E_INPUT_INVALID',
            false,
          )
        }
        seenNames.add(input.name)

        if (preview) {
          writeInfo(json, `~ preview ${input.name}`)
          writeJsonLine(json, {
            type: 'preview_base',
            command: 'sync:claude:agents',
            name: input.name,
            kind: 'agents',
            source_kind: input.sourceKind,
            content: input.baseContent,
          })
          for (const tool of GENERATION_TARGETS) {
            writeJsonLine(json, {
              type: 'preview_generated',
              command: 'sync:claude:agents',
              name: input.name,
              kind: 'agents',
              source_kind: input.sourceKind,
              tool,
              content: input.generated[tool],
            })
          }
          return { success: true, name: input.name, previewed: true }
        }

        const codexFm = convertFrontmatter(
          { name: input.name, description: input.description },
          projectMeta.version,
          projectMeta.license,
        )
        const skillContent = buildSkillContent(codexFm, input.generated.claude)
        const destPath = path.join(outputBase, input.name, 'SKILL.md')
        writeAtomic(destPath, skillContent, outputBase)

        writeInfo(json, `✓ ${input.name} → ${destPath}`)
        writeJsonLine(json, {
          type: 'synced',
          command: 'sync:claude:agents',
          name: input.name,
          dest: destPath,
        })

        return { success: true, name: input.name, dest: destPath, previewed: false }
      } catch (err) {
        const cliErr = toCliError(err, 'E_SCHEMA_FRONTMATTER')
        const code = cliErr.message.includes('パストラバーサル') ? 'E_SYNC_OUTPUT_PATH' : cliErr.code
        const targetFile = entry.entryKind === 'legacy' ? entry.fullPath : entry.familyDir

        writeWarn(json, `✗ ${targetFile}: ${cliErr.message}`)
        writeJsonLine(json, {
          type: 'error',
          command: 'sync:claude:agents',
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
        command: 'sync:claude:agents',
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
      command: 'sync:claude:agents',
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
      command: 'sync:claude:agents',
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
