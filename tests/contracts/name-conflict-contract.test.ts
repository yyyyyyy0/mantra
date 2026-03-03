import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createTempHome, removeTempHome, runScript } from '../helpers/cli-runner'

function expectSummary(result: ReturnType<typeof runScript>, command: string): Record<string, unknown> {
  const summary = result.jsonLines.find(line => line.type === 'summary')
  expect(summary).toBeDefined()
  expect(summary?.command).toBe(command)
  expect(summary?.success).toBe(false)
  return summary as Record<string, unknown>
}

describe.sequential('name conflict CLI contract', () => {
  const homes: string[] = []
  const tempDirs: string[] = []

  afterEach(() => {
    while (tempDirs.length > 0) {
      fs.rmSync(tempDirs.pop() as string, { recursive: true, force: true })
    }
    while (homes.length > 0) {
      removeTempHome(homes.pop() as string)
    }
  })

  it('uses E_INPUT_INVALID as summary error_code for duplicate agent names', () => {
    const home = createTempHome('mantra-contract-agent-dup-')
    homes.push(home)
    const agentsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mantra-agent-dup-'))
    tempDirs.push(agentsDir)

    fs.writeFileSync(
      path.join(agentsDir, 'alpha-agent.md'),
      [
        '---',
        'name: duplicate-agent-contract',
        'description: alpha',
        '---',
        '# alpha',
        '',
      ].join('\n'),
      'utf8',
    )
    fs.writeFileSync(
      path.join(agentsDir, 'beta-agent.md'),
      [
        '---',
        'name: duplicate-agent-contract',
        'description: beta',
        '---',
        '# beta',
        '',
      ].join('\n'),
      'utf8',
    )

    const result = runScript(
      'validate-agents.ts',
      ['--json'],
      home,
      { MANTRA_USER_AGENTS_DIRS: agentsDir },
    )

    expect(result.raw.status).toBe(1)

    const duplicateError = result.jsonLines.find(
      line =>
        line.type === 'error' &&
        typeof line.message === 'string' &&
        line.message.includes('重複した agent name が見つかりました'),
    )
    expect(duplicateError?.error_code).toBe('E_INPUT_INVALID')

    const summary = expectSummary(result, 'validate:agents')
    expect(summary.error_code).toBe('E_INPUT_INVALID')
  })

  it('uses E_INPUT_INVALID as summary error_code for duplicate rule names', () => {
    const home = createTempHome('mantra-contract-rule-dup-')
    homes.push(home)
    const rulesDirA = fs.mkdtempSync(path.join(os.tmpdir(), 'mantra-rule-dup-a-'))
    const rulesDirB = fs.mkdtempSync(path.join(os.tmpdir(), 'mantra-rule-dup-b-'))
    tempDirs.push(rulesDirA, rulesDirB)

    fs.writeFileSync(path.join(rulesDirA, 'duplicate-rule-contract.md'), '# first\n', 'utf8')
    fs.writeFileSync(path.join(rulesDirB, 'duplicate-rule-contract.md'), '# second\n', 'utf8')

    const result = runScript(
      'validate-rules.ts',
      ['--json'],
      home,
      { MANTRA_USER_RULES_DIRS: `${rulesDirA},${rulesDirB}` },
    )

    expect(result.raw.status).toBe(1)

    const duplicateError = result.jsonLines.find(
      line =>
        line.type === 'error' &&
        typeof line.message === 'string' &&
        line.message.includes('重複した rule name が見つかりました'),
    )
    expect(duplicateError?.error_code).toBe('E_INPUT_INVALID')

    const summary = expectSummary(result, 'validate:rules')
    expect(summary.error_code).toBe('E_INPUT_INVALID')
  })
})
