import * as fs from 'fs'
import { parseRuleFile } from './lib/rule-parser'
import { SAFE_NAME_RE } from './lib/rule-schema'
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
import { selectSummaryErrorCode } from './lib/validation-summary'

type SeenOutputType = 'legacy' | 'family'

interface SeenOutput {
  file: string
  type: SeenOutputType
}

function parseFamilyField(
  fieldName: 'family' | 'families',
  raw: unknown,
  filePath: string,
): string[] {
  if (raw === undefined) {
    return []
  }

  const values =
    typeof raw === 'string'
      ? raw
          .split(',')
          .map(value => value.trim())
          .filter(Boolean)
      : Array.isArray(raw)
        ? raw
        : null

  if (values === null) {
    throw new CliError(
      `${fieldName} は文字列または文字列配列で指定してください (${filePath})`,
      'E_INPUT_INVALID',
      false,
    )
  }

  const out: string[] = []
  for (const value of values) {
    if (typeof value !== 'string') {
      throw new CliError(
        `${fieldName} は文字列のみ指定できます (${filePath})`,
        'E_INPUT_INVALID',
        false,
      )
    }
    out.push(value.trim())
  }
  return out.filter(Boolean)
}

function extractFamilyDirectives(content: string): string[] {
  const entries: string[] = []
  const matcher = /<!--\s*(?:mantra-)?famil(?:y|ies)\s*:\s*([^>]+?)\s*-->/gi
  let match: RegExpExecArray | null = matcher.exec(content)
  while (match !== null) {
    const value = match[1]
      .split(',')
      .map(raw => raw.trim())
      .filter(Boolean)
    entries.push(...value)
    match = matcher.exec(content)
  }
  return entries
}

function extractFamilyOutputs(
  metadata: Record<string, unknown>,
  content: string,
  filePath: string,
): string[] {
  const fromMetadata = [
    ...parseFamilyField('family', metadata.family, filePath),
    ...parseFamilyField('families', metadata.families, filePath),
  ]
  const merged = [...fromMetadata, ...extractFamilyDirectives(content)]
  const deduped = [...new Set(merged)]

  for (const outputName of deduped) {
    if (!SAFE_NAME_RE.test(outputName)) {
      throw new CliError(
        `family output 名が不正です: ${outputName} (${filePath})`,
        'E_INPUT_INVALID',
        false,
      )
    }
  }

  return deduped
}

function collectOutputs(legacyName: string, familyOutputs: string[]): { name: string; type: SeenOutputType }[] {
  return [
    { name: legacyName, type: 'legacy' },
    ...familyOutputs.map(name => ({ name, type: 'family' as const })),
  ]
}

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
    const seenNames = new Map<string, string>()
    const seenOutputs = new Map<string, SeenOutput>()

    let errors = 0
    const errorCodes: CliError['code'][] = []

    for (const file of files) {
      const content = fs.readFileSync(file.fullPath, 'utf8')

      try {
        const { metadata } = parseRuleFile(content, file.relativeName)
        const familyOutputs = extractFamilyOutputs(
          metadata as unknown as Record<string, unknown>,
          content,
          file.fullPath,
        )

        const previousLegacy = seenNames.get(metadata.name)
        if (previousLegacy !== undefined) {
          throw new CliError(
            `重複した rule name が見つかりました: ${metadata.name}`,
            'E_INPUT_INVALID',
            false,
          )
        }
        seenNames.set(metadata.name, file.fullPath)

        for (const output of collectOutputs(metadata.name, familyOutputs)) {
          const existing = seenOutputs.get(output.name)
          if (existing !== undefined) {
            throw new CliError(
              `重複した rule output が見つかりました: ${output.name} (${existing.file} と ${file.fullPath})`,
              'E_INPUT_INVALID',
              false,
            )
          }
          seenOutputs.set(output.name, {
            file: file.fullPath,
            type: output.type,
          })
        }

        writeJsonLine(json, {
          type: 'validated',
          command: 'validate:rules',
          file: file.fullPath,
          success: true,
          outputs: {
            legacy: [metadata.name],
            family: familyOutputs,
          },
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
        errorCodes.push(cliErr.code)
        errors++
      }
    }

    if (errors > 0) {
      const summaryErrorCode = selectSummaryErrorCode(errorCodes, 'E_SCHEMA_RULE')
      writeWarn(json, `\n${errors} 件のエラーが見つかりました`)
      finishCommand({
        command: 'validate:rules',
        json,
        startedAt,
        success: false,
        error: new CliError(`${errors} 件のエラーが見つかりました`, summaryErrorCode, false),
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
