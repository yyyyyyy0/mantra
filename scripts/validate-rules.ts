import * as fs from 'fs'
import { parseRuleFile } from './lib/rule-parser'
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
    const sourceDirs = resolveContentSources('rules')
    if (sourceDirs.length === 0) {
      throw new CliError('rules のソースディレクトリが見つかりません', 'E_INPUT_INVALID', false)
    }
    for (const source of sourceDirs) {
      ensureReadableDirectory(source.dir, source.label)
    }
    const files = listContentFiles('rules')
    const seenNames = new Set<string>()

    let errors = 0

    for (const file of files) {
      const content = fs.readFileSync(file.fullPath, 'utf8')

      try {
        const { metadata } = parseRuleFile(content, file.relativeName)
        if (seenNames.has(metadata.name)) {
          throw new CliError(
            `重複した rule name が見つかりました: ${metadata.name}`,
            'E_INPUT_INVALID',
            false,
          )
        }
        seenNames.add(metadata.name)
        writeJsonLine(json, {
          type: 'validated',
          command: 'validate:rules',
          file: file.fullPath,
          success: true,
        })
      } catch (err) {
        const cliErr = toCliError(err, 'E_SCHEMA_RULE')
        writeWarn(json, `✗ ${file.fullPath}: ${cliErr.message}`)
        writeJsonLine(json, {
          type: 'error',
          command: 'validate:rules',
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
        command: 'validate:rules',
        json,
        startedAt,
        success: false,
        error: new CliError(`${errors} 件のエラーが見つかりました`, 'E_SCHEMA_RULE', false),
        details: { checked: files.length, errors },
      })
      process.exit(1)
    }

    writeInfo(json, `✓ ${files.length} 件のルール定義が有効です`)
    finishCommand({
      command: 'validate:rules',
      json,
      startedAt,
      success: true,
      details: { checked: files.length, errors: 0 },
    })
  } catch (err) {
    const cliErr = toCliError(err, 'E_INTERNAL')
    writeWarn(json, cliErr.message)
    finishCommand({
      command: 'validate:rules',
      json,
      startedAt,
      success: false,
      error: cliErr,
    })
    process.exit(1)
  }
}

main()
