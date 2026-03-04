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

function writeAgentFamily(args: {
  agentsDir: string
  familyDirName: string
  nameInConfig?: string
  description?: string
}): void {
  const dir = path.join(args.agentsDir, `${args.familyDirName}.family`)
  fs.mkdirSync(path.join(dir, 'overlays'), { recursive: true })

  const lines: string[] = []
  if (args.nameInConfig !== undefined) {
    lines.push(`name: ${args.nameInConfig}`)
  }
  lines.push(`description: ${args.description ?? 'Family Description'}`)
  fs.writeFileSync(path.join(dir, 'family.yml'), `${lines.join('\n')}\ntargets: {}\n`, 'utf8')
  fs.writeFileSync(path.join(dir, 'base.md'), 'Family Base\n', 'utf8')
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

  it('prefers family over legacy within the same source and still validates successfully', () => {
    const home = createTempHome('mantra-family-agent-conflict-')
    homes.push(home)

    const userAgentsDir = createTempDir('mantra-family-agent-dir-')
    tempDirs.push(userAgentsDir)

    writeAgent(path.join(userAgentsDir, 'legacy-output.md'), 'legacy-output')
    writeAgentFamily({
      agentsDir: userAgentsDir,
      familyDirName: 'legacy-output',
      description: 'Family conflict',
    })

    const result = runScript('validate-agents.ts', ['--json'], home, {
      MANTRA_USER_AGENTS_DIRS: userAgentsDir,
    })
    expect(result.raw.status, result.stderr).toBe(0)

    const validated = result.jsonLines.find(
      line => line.type === 'validated' && line.source_kind === 'family' && line.output_name === 'legacy-output',
    )
    expect(validated).toBeDefined()
  })

  it('returns E_INPUT_INVALID when two families in one source resolve to the same output name', () => {
    const home = createTempHome('mantra-family-duplicate-output-')
    homes.push(home)

    const userAgentsDir = createTempDir('mantra-family-duplicate-output-dir-')
    tempDirs.push(userAgentsDir)

    writeAgentFamily({
      agentsDir: userAgentsDir,
      familyDirName: 'family-a',
      nameInConfig: 'duplicate-family-output',
      description: 'Family A',
    })
    writeAgentFamily({
      agentsDir: userAgentsDir,
      familyDirName: 'family-b',
      nameInConfig: 'duplicate-family-output',
      description: 'Family B',
    })

    const result = runScript('validate-agents.ts', ['--json'], home, {
      MANTRA_USER_AGENTS_DIRS: userAgentsDir,
    })
    expect(result.raw.status, result.stderr).toBe(1)

    const summary = result.jsonLines.find(line => line.type === 'summary')
    expect(summary?.success).toBe(false)
    expect(summary?.error_code).toBe('E_INPUT_INVALID')
  })

  it('returns E_INPUT_INVALID for invalid family output name', () => {
    const home = createTempHome('mantra-family-invalid-name-')
    homes.push(home)

    const userAgentsDir = createTempDir('mantra-family-invalid-dir-')
    tempDirs.push(userAgentsDir)

    writeAgentFamily({
      agentsDir: userAgentsDir,
      familyDirName: 'invalid name',
      description: 'Invalid family name',
    })

    const result = runScript('validate-agents.ts', ['--json'], home, {
      MANTRA_USER_AGENTS_DIRS: userAgentsDir,
    })
    expect(result.raw.status, result.stderr).toBe(1)

    const summary = result.jsonLines.find(line => line.type === 'summary')
    expect(summary?.success).toBe(false)
    expect(summary?.error_code).toBe('E_INPUT_INVALID')
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
