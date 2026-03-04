import * as fs from 'node:fs'
import * as yaml from 'js-yaml'
import { ClaudeAgentFrontmatter } from './lib/agent-schema'
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
import { resolveContentSources } from './lib/content-sources'
import { selectSummaryErrorCode } from './lib/validation-summary'

interface ParsedAgent {
  frontmatter: typeof ClaudeAgentFrontmatter._output
}

function parseAgentFrontmatter(content: string): ParsedAgent {
  const lines = content.split('\n')
  const startIndex = lines.indexOf('---')
  const endIndex = lines.indexOf('---', 1)

  if (startIndex !== 0 || endIndex === -1) {
    throw new CliError('Invalid frontmatter format', 'E_SCHEMA_FRONTMATTER', false)
  }

  const rawYaml = lines.slice(1, endIndex).join('\n')
  const parsed = yaml.load(rawYaml, { schema: yaml.DEFAULT_SCHEMA })
  const frontmatter = ClaudeAgentFrontmatter.parse(parsed)

  return { frontmatter }
}

function main(): void {
  const json = hasJsonFlag(process.argv)
  const startedAt = Date.now()

  try {
    ensureNodeVersion(20)

    const sourceDirs = resolveContentSources('agents')
    if (sourceDirs.length === 0) {
      throw new CliError('agents のソースディレクトリが見つかりません', 'E_INPUT_INVALID', false)
    }
    for (const source of sourceDirs) {
      ensureReadableDirectory(source.dir, source.label)
    }

    const listed = listContentEntries('agents', { target: 'claude' })
    const entries = listed.entries
    const seenNames = new Map<string, string>()

    let errors = 0
    const errorCodes: CliError['code'][] = []

    for (const entry of entries) {
      try {
        let name: string

        if (entry.entryKind === 'legacy') {
          const content = fs.readFileSync(entry.fullPath, 'utf8')
          const parsed = parseAgentFrontmatter(content)
          name = parsed.frontmatter.name
        } else {
          name = entry.family.outputName
        }

        const previous = seenNames.get(name)
        if (previous !== undefined) {
          throw new CliError(
            `重複した agent name が見つかりました: ${name} (${previous} と ${entry.fullPath})`,
            'E_INPUT_INVALID',
            false,
          )
        }
        seenNames.set(name, entry.fullPath)

        writeJsonLine(json, {
          type: 'validated',
          command: 'validate:agents',
          file: entry.entryKind === 'legacy' ? entry.fullPath : entry.familyDir,
          success: true,
          source_kind: entry.entryKind,
          output_name: name,
        })
      } catch (err) {
        const cliErr = toCliError(err, 'E_SCHEMA_FRONTMATTER')
        const targetFile = entry.entryKind === 'legacy' ? entry.fullPath : entry.familyDir

        writeWarn(json, `✗ ${targetFile}: ${cliErr.message}`)
        writeJsonLine(json, {
          type: 'error',
          command: 'validate:agents',
          file: targetFile,
          message: cliErr.message,
          error_code: cliErr.code,
          retryable: cliErr.retryable,
        })
        errorCodes.push(cliErr.code)
        errors++
      }
    }

    if (errors > 0) {
      const summaryErrorCode = selectSummaryErrorCode(errorCodes, 'E_SCHEMA_FRONTMATTER')
      writeWarn(json, `\n${errors} 件のエラーが見つかりました`)
      finishCommand({
        command: 'validate:agents',
        json,
        startedAt,
        success: false,
        error: new CliError(`${errors} 件のエラーが見つかりました`, summaryErrorCode, false),
        details: { checked: entries.length, errors },
      })
      process.exit(1)
    }

    writeInfo(json, `✓ ${entries.length} 件のエージェント定義が有効です`)
    finishCommand({
      command: 'validate:agents',
      json,
      startedAt,
      success: true,
      details: { checked: entries.length, errors: 0 },
    })
  } catch (err) {
    const cliErr = toCliError(err, 'E_INTERNAL')
    writeWarn(json, cliErr.message)
    finishCommand({
      command: 'validate:agents',
      json,
      startedAt,
      success: false,
      error: cliErr,
    })
    process.exit(1)
  }
}

main()
