import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createTempHome, removeTempHome, runScript, type CliRunResult } from '../helpers/cli-runner'

function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function writeAgent(filePath: string, name: string, familyOutputs: string[] = []): void {
  const familyBlock =
    familyOutputs.length > 0
      ? `families: [${familyOutputs.map(value => JSON.stringify(value)).join(', ')}]\n`
      : ''
  fs.writeFileSync(
    filePath,
    `---\nname: ${name}\ndescription: Name conflict contract\n${familyBlock}tools: []\n---\nBody\n`,
    'utf8',
  )
}

function writeRule(filePath: string, heading: string, familyOutputs: string[] = []): void {
  const familyDirective =
    familyOutputs.length > 0
      ? `<!-- mantra-families: ${familyOutputs.join(', ')} -->\n\n`
      : ''
  fs.writeFileSync(filePath, `${familyDirective}# ${heading}\n\nBody\n`, 'utf8')
}

function runValidateAgentsWithDuplicateNames(home: string, tempDirs: string[]): CliRunResult {
  const userAgentsDir = createTempDir('mantra-dup-agent-')
  tempDirs.push(userAgentsDir)

  writeAgent(path.join(userAgentsDir, 'dup-a.md'), 'duplicate-agent-contract')
  writeAgent(path.join(userAgentsDir, 'dup-b.md'), 'duplicate-agent-contract')

  return runScript('validate-agents.ts', ['--json'], home, {
    MANTRA_USER_AGENTS_DIRS: userAgentsDir,
  })
}

describe('Name conflict contract', () => {
  const homes: string[] = []
  const tempDirs: string[] = []

  afterEach(() => {
    while (homes.length > 0) {
      removeTempHome(homes.pop() as string)
    }
    while (tempDirs.length > 0) {
      fs.rmSync(tempDirs.pop() as string, { recursive: true, force: true })
    }
  })

  it('returns E_INPUT_INVALID for duplicate agent names', () => {
    const home = createTempHome('mantra-dup-agent-contract-')
    homes.push(home)

    const result = runValidateAgentsWithDuplicateNames(home, tempDirs)
    expect(result.raw.status, result.stderr).toBe(1)

    const duplicateError = result.jsonLines.find(
      line =>
        line.type === 'error' &&
        line.error_code === 'E_INPUT_INVALID' &&
        String(line.message).includes('重複した agent name'),
    )
    expect(duplicateError).toBeDefined()

    const summary = result.jsonLines.find(line => line.type === 'summary')
    expect(summary?.success).toBe(false)
    expect(summary?.error_code).toBe('E_INPUT_INVALID')
  })

  it('emits outputs preview for agent legacy/family entries', () => {
    const home = createTempHome('mantra-family-agent-preview-')
    homes.push(home)

    const userAgentsDir = createTempDir('mantra-family-agent-preview-dir-')
    tempDirs.push(userAgentsDir)

    writeAgent(path.join(userAgentsDir, 'family-preview.md'), 'family-preview-agent', ['planning'])

    const result = runScript('validate-agents.ts', ['--json'], home, {
      MANTRA_USER_AGENTS_DIRS: userAgentsDir,
    })
    expect(result.raw.status, result.stderr).toBe(0)

    const validated = result.jsonLines.find(
      line =>
        line.type === 'validated' &&
        String(line.file).endsWith(path.join('family-preview.md')),
    )
    expect(validated).toBeDefined()
    expect(validated?.outputs).toEqual({
      legacy: ['family-preview-agent'],
      family: ['planning'],
    })
  })

  it('returns E_INPUT_INVALID for duplicate rule names', () => {
    const home = createTempHome('mantra-dup-rule-contract-')
    homes.push(home)

    const userRulesDirA = createTempDir('mantra-dup-rule-a-')
    const userRulesDirB = createTempDir('mantra-dup-rule-b-')
    tempDirs.push(userRulesDirA, userRulesDirB)

    writeRule(path.join(userRulesDirA, 'duplicate-rule-contract.md'), 'Duplicate Rule A')
    writeRule(path.join(userRulesDirB, 'duplicate-rule-contract.md'), 'Duplicate Rule B')

    const result = runScript('validate-rules.ts', ['--json'], home, {
      MANTRA_USER_RULES_DIRS: `${userRulesDirA},${userRulesDirB}`,
    })
    expect(result.raw.status, result.stderr).toBe(1)

    const duplicateError = result.jsonLines.find(
      line =>
        line.type === 'error' &&
        line.error_code === 'E_INPUT_INVALID' &&
        String(line.message).includes('重複した rule name'),
    )
    expect(duplicateError).toBeDefined()

    const summary = result.jsonLines.find(line => line.type === 'summary')
    expect(summary?.success).toBe(false)
    expect(summary?.error_code).toBe('E_INPUT_INVALID')
  })

  it('emits outputs preview for rule legacy/family entries', () => {
    const home = createTempHome('mantra-family-rule-preview-')
    homes.push(home)

    const userRulesDir = createTempDir('mantra-family-rule-preview-dir-')
    tempDirs.push(userRulesDir)

    writeRule(path.join(userRulesDir, 'family-preview-rule.md'), 'Family Preview Rule', ['governance'])

    const result = runScript('validate-rules.ts', ['--json'], home, {
      MANTRA_USER_RULES_DIRS: userRulesDir,
    })
    expect(result.raw.status, result.stderr).toBe(0)

    const validated = result.jsonLines.find(
      line =>
        line.type === 'validated' &&
        String(line.file).endsWith(path.join('family-preview-rule.md')),
    )
    expect(validated).toBeDefined()
    expect(validated?.outputs).toEqual({
      legacy: ['family-preview-rule'],
      family: ['governance'],
    })
  })

  it('returns E_INPUT_INVALID when agent family output conflicts with legacy output', () => {
    const home = createTempHome('mantra-family-agent-output-conflict-')
    homes.push(home)

    const userAgentsDir = createTempDir('mantra-family-agent-')
    tempDirs.push(userAgentsDir)

    writeAgent(path.join(userAgentsDir, 'legacy-output.md'), 'legacy-agent-output')
    writeAgent(path.join(userAgentsDir, 'family-output.md'), 'family-agent-output', [
      'legacy-agent-output',
    ])

    const result = runScript('validate-agents.ts', ['--json'], home, {
      MANTRA_USER_AGENTS_DIRS: userAgentsDir,
    })
    expect(result.raw.status, result.stderr).toBe(1)

    const duplicateError = result.jsonLines.find(
      line =>
        line.type === 'error' &&
        line.error_code === 'E_INPUT_INVALID' &&
        String(line.message).includes('重複した agent output'),
    )
    expect(duplicateError).toBeDefined()

    const summary = result.jsonLines.find(line => line.type === 'summary')
    expect(summary?.success).toBe(false)
    expect(summary?.error_code).toBe('E_INPUT_INVALID')
  })

  it('returns E_INPUT_INVALID for invalid agent family output names', () => {
    const home = createTempHome('mantra-family-agent-invalid-output-')
    homes.push(home)

    const userAgentsDir = createTempDir('mantra-family-agent-invalid-dir-')
    tempDirs.push(userAgentsDir)

    writeAgent(path.join(userAgentsDir, 'invalid-family-output.md'), 'invalid-family-output-agent', [
      'invalid family output',
    ])

    const result = runScript('validate-agents.ts', ['--json'], home, {
      MANTRA_USER_AGENTS_DIRS: userAgentsDir,
    })
    expect(result.raw.status, result.stderr).toBe(1)

    const invalidError = result.jsonLines.find(
      line =>
        line.type === 'error' &&
        line.error_code === 'E_INPUT_INVALID' &&
        String(line.message).includes('family output 名が不正'),
    )
    expect(invalidError).toBeDefined()
  })

  it('returns E_INPUT_INVALID when rule family output conflicts with legacy output', () => {
    const home = createTempHome('mantra-family-rule-output-conflict-')
    homes.push(home)

    const userRulesDir = createTempDir('mantra-family-rule-')
    tempDirs.push(userRulesDir)

    writeRule(path.join(userRulesDir, 'legacy-rule-output.md'), 'Legacy Rule Output')
    writeRule(path.join(userRulesDir, 'family-rule-output.md'), 'Family Rule Output', [
      'legacy-rule-output',
    ])

    const result = runScript('validate-rules.ts', ['--json'], home, {
      MANTRA_USER_RULES_DIRS: userRulesDir,
    })
    expect(result.raw.status, result.stderr).toBe(1)

    const duplicateError = result.jsonLines.find(
      line =>
        line.type === 'error' &&
        line.error_code === 'E_INPUT_INVALID' &&
        String(line.message).includes('重複した rule output'),
    )
    expect(duplicateError).toBeDefined()

    const summary = result.jsonLines.find(line => line.type === 'summary')
    expect(summary?.success).toBe(false)
    expect(summary?.error_code).toBe('E_INPUT_INVALID')
  })

  it('returns E_INPUT_INVALID for invalid rule family output names', () => {
    const home = createTempHome('mantra-family-rule-invalid-output-')
    homes.push(home)

    const userRulesDir = createTempDir('mantra-family-rule-invalid-dir-')
    tempDirs.push(userRulesDir)

    writeRule(path.join(userRulesDir, 'invalid-rule-family-output.md'), 'Invalid Rule Family', [
      'invalid rule family',
    ])

    const result = runScript('validate-rules.ts', ['--json'], home, {
      MANTRA_USER_RULES_DIRS: userRulesDir,
    })
    expect(result.raw.status, result.stderr).toBe(1)

    const invalidError = result.jsonLines.find(
      line =>
        line.type === 'error' &&
        line.error_code === 'E_INPUT_INVALID' &&
        String(line.message).includes('family output 名が不正'),
    )
    expect(invalidError).toBeDefined()
  })

  it('does not emit warning contract fields on validation failure paths', () => {
    const home = createTempHome('mantra-no-warning-contract-')
    homes.push(home)

    const result = runValidateAgentsWithDuplicateNames(home, tempDirs)
    expect(result.raw.status, result.stderr).toBe(1)

    const warningLines = result.jsonLines.filter(line => line.type === 'warning')
    expect(warningLines).toHaveLength(0)

    const summary = result.jsonLines.find(line => line.type === 'summary')
    expect(summary?.success).toBe(false)
    expect(summary?.warning_count).toBeUndefined()
    expect(summary?.warning_types).toBeUndefined()
  })
})
