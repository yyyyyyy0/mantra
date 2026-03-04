import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as yaml from 'js-yaml'
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
type GenerationTarget = 'claude' | 'codex' | 'generic'

const GENERATION_TARGETS: GenerationTarget[] = ['claude', 'codex', 'generic']

interface FamilySyncContent {
  family: string
  base: string
  generated: Partial<Record<GenerationTarget, string>>
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function extractFrontmatterObject(content: string): Record<string, unknown> | null {
  const DELIMITER = '---'
  const lines = content.split('\n')
  if (lines[0] !== DELIMITER) {
    return null
  }
  const endIndex = lines.indexOf(DELIMITER, 1)
  if (endIndex === -1) {
    return null
  }

  const rawYaml = lines.slice(1, endIndex).join('\n')
  const parsed = yaml.load(rawYaml, { schema: yaml.DEFAULT_SCHEMA })
  return isRecord(parsed) ? parsed : null
}

function toTargetContentMap(value: unknown): Partial<Record<GenerationTarget, string>> {
  if (!isRecord(value)) {
    return {}
  }
  const out: Partial<Record<GenerationTarget, string>> = {}
  for (const target of GENERATION_TARGETS) {
    const targetValue = value[target]
    if (typeof targetValue === 'string') {
      out[target] = targetValue
    }
  }
  return out
}

function parseFamilySyncContent(content: string): FamilySyncContent {
  const parsed = extractFrontmatterObject(content)
  if (parsed === null) {
    return { family: 'legacy', base: content, generated: {} }
  }

  const result: FamilySyncContent = {
    family: 'legacy',
    base: content,
    generated: {
      ...toTargetContentMap(parsed.generated),
      ...toTargetContentMap(parsed.targets),
    },
  }

  const applyPayload = (payload: unknown, fallbackFamily?: string): void => {
    if (typeof payload === 'string') {
      if (fallbackFamily !== undefined) {
        result.family = fallbackFamily
        if (GENERATION_TARGETS.includes(fallbackFamily as GenerationTarget)) {
          result.generated[fallbackFamily as GenerationTarget] = payload
        } else {
          result.base = payload
        }
      } else if (payload.trim().length > 0) {
        result.family = payload
      }
      return
    }
    if (!isRecord(payload)) {
      return
    }

    if (typeof payload.name === 'string' && payload.name.trim().length > 0) {
      result.family = payload.name
    } else if (fallbackFamily !== undefined) {
      result.family = fallbackFamily
    }

    if (typeof payload.base === 'string') {
      result.base = payload.base
    } else if (typeof payload.content === 'string') {
      result.base = payload.content
    }

    Object.assign(result.generated, toTargetContentMap(payload))
    Object.assign(result.generated, toTargetContentMap(payload.generated))
    Object.assign(result.generated, toTargetContentMap(payload.targets))
  }

  applyPayload(parsed.mantra_family)
  applyPayload(parsed.family)

  const familiesPayload = parsed.mantra_families ?? parsed.families
  if (isRecord(familiesPayload)) {
    const directTargets = toTargetContentMap(familiesPayload)
    if (Object.keys(directTargets).length > 0) {
      Object.assign(result.generated, directTargets)
      result.family = 'family'
    } else {
      const preferredKey = ['codex', 'generic', 'claude'].find(k => k in familiesPayload)
      const [firstKey] = Object.keys(familiesPayload)
      const chosenKey = preferredKey ?? firstKey
      if (chosenKey !== undefined) {
        applyPayload(familiesPayload[chosenKey], chosenKey)
      }
    }
  }

  return result
}

function buildGeneratedContent(
  familyContent: FamilySyncContent,
  codexContent: string,
): Record<GenerationTarget, string> {
  return {
    claude: familyContent.generated.claude ?? familyContent.base,
    codex: familyContent.generated.codex ?? codexContent,
    generic: familyContent.generated.generic ?? familyContent.base,
  }
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
  const preview = process.argv.includes('--preview')
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
    if (!preview) {
      ensureWritableParent(path.join(outputBase, '.touch'), 'sync destination')
    }
    const projectMeta = getProjectMeta()

    const files = listContentFiles('rules')
    if (files.length === 0) {
      throw new CliError('rules のソースファイルが見つかりません', 'E_INPUT_INVALID', false)
    }

    type Result =
      | { success: true; name: string; dest?: string; previewed: boolean }
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
        const familyContent = parseFamilySyncContent(content)
        const generatedContent = buildGeneratedContent(familyContent, skillContent)

        if (preview) {
          writeInfo(json, `~ preview ${metadata.name}`)
          writeJsonLine(json, {
            type: 'preview_base',
            command: 'sync:codex:rules',
            name: metadata.name,
            file: file.fullPath,
            family: familyContent.family,
            content: familyContent.base,
          })
          for (const target of GENERATION_TARGETS) {
            writeJsonLine(json, {
              type: 'preview_generated',
              command: 'sync:codex:rules',
              name: metadata.name,
              file: file.fullPath,
              family: familyContent.family,
              target,
              content: generatedContent[target],
            })
          }
          return { success: true, name: metadata.name, previewed: true }
        }

        const destPath = path.join(outputBase, metadata.name, 'SKILL.md')
        writeAtomic(destPath, generatedContent.codex, outputBase)

        writeInfo(json, `✓ ${metadata.name} → ${destPath}`)
        writeJsonLine(json, {
          type: 'synced',
          command: 'sync:codex:rules',
          name: metadata.name,
          dest: destPath,
        })
        return { success: true, name: metadata.name, dest: destPath, previewed: false }
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
    const previewedCount = successes.filter(r => r.previewed).length

    if (preview) {
      writeInfo(json, `\n${previewedCount}/${files.length} 件をプレビューしました`)
    } else {
      writeInfo(json, `\n${successes.length}/${files.length} 件を同期しました → ${outputBase}`)
    }

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
          ...(preview ? { previewed: previewedCount } : { synced: successes.length }),
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
      details: preview
        ? { previewed: previewedCount, total: files.length }
        : { synced: successes.length, total: files.length },
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
