import * as fs from 'fs'
import * as yaml from 'js-yaml'
import { ClaudeAgentFrontmatter } from './lib/agent-schema'
import { listContentFiles, resolveContentSources } from './lib/content-sources'
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
    const files = listContentFiles('agents')
    const seenNames = new Set<string>()

    let errors = 0

    for (const file of files) {
      const content = fs.readFileSync(file.fullPath, 'utf8')

      try {
        // Parse and validate
        const lines = content.split('\n')
        const startIndex = lines.indexOf('---')
        const endIndex = lines.indexOf('---', 1)

        if (startIndex !== 0 || endIndex === -1) {
          throw new CliError('Invalid frontmatter format', 'E_SCHEMA_FRONTMATTER', false)
        }

        const rawYaml = lines.slice(1, endIndex).join('\n')
        const parsed = yaml.load(rawYaml, { schema: yaml.DEFAULT_SCHEMA })
        const metadata = ClaudeAgentFrontmatter.parse(parsed)
        if (seenNames.has(metadata.name)) {
          throw new CliError(
            `重複した agent name が見つかりました: ${metadata.name}`,
            'E_INPUT_INVALID',
            false,
          )
        }
        seenNames.add(metadata.name)
        writeJsonLine(json, {
          type: 'validated',
          command: 'validate:agents',
          file: file.fullPath,
          success: true,
        })
      } catch (err) {
        const cliErr = toCliError(err, 'E_SCHEMA_FRONTMATTER')
        writeWarn(json, `✗ ${file.fullPath}: ${cliErr.message}`)
        writeJsonLine(json, {
          type: 'error',
          command: 'validate:agents',
          file: file.fullPath,
          message: cliErr.message,
          error_code: cliErr.code,
          retryable: cliErr.retryable,
        })
        errors++
      }
    }

    if (errors > 0) {
      writeWarn(json, `\n${errors} 件のエラーが見つかりました`)
      finishCommand({
        command: 'validate:agents',
        json,
        startedAt,
        success: false,
        error: new CliError(`${errors} 件のエラーが見つかりました`, 'E_SCHEMA_FRONTMATTER', false),
        details: { checked: files.length, errors },
      })
      process.exit(1)
    }

    writeInfo(json, `✓ ${files.length} 件のエージェント定義が有効です`)
    finishCommand({
      command: 'validate:agents',
      json,
      startedAt,
      success: true,
      details: { checked: files.length, errors: 0 },
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
