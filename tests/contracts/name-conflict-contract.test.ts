import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createTempHome, removeTempHome, runScript, type CliRunResult } from '../helpers/cli-runner'

function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function writeAgent(filePath: string, name: string): void {
  fs.writeFileSync(
    filePath,
    `---\nname: ${name}\ndescription: Name conflict contract\ntools: []\n---\nBody\n`,
    'utf8',
  )
}

function writeRule(filePath: string, heading: string): void {
  fs.writeFileSync(filePath, `# ${heading}\n\nBody\n`, 'utf8')
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
    expect(summary?.error_code).toBe('E_SCHEMA_FRONTMATTER')
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
    expect(summary?.error_code).toBe('E_SCHEMA_RULE')
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
