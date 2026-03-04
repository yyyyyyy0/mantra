import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createTempHome, removeTempHome, runScript } from '../helpers/cli-runner'

function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function writeAgentFamily(args: {
  agentsDir: string
  familyName: string
  familyYml: string
  baseContent: string
  overlays?: Record<string, string>
}): string {
  const familyDir = path.join(args.agentsDir, `${args.familyName}.family`)
  fs.mkdirSync(path.join(familyDir, 'overlays'), { recursive: true })
  fs.writeFileSync(path.join(familyDir, 'family.yml'), args.familyYml, 'utf8')
  fs.writeFileSync(path.join(familyDir, 'base.md'), args.baseContent, 'utf8')

  for (const [name, content] of Object.entries(args.overlays ?? {})) {
    fs.writeFileSync(path.join(familyDir, 'overlays', name), content, 'utf8')
  }

  return familyDir
}

describe('validate:drift contract', () => {
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

  it('passes when drift_guard lock blocks are intact and ratio is within budget', () => {
    const home = createTempHome('mantra-drift-pass-')
    homes.push(home)

    const agentsDir = createTempDir('mantra-drift-pass-agents-')
    tempDirs.push(agentsDir)

    writeAgentFamily({
      agentsDir,
      familyName: 'drift-pass-family',
      familyYml: [
        'description: drift pass',
        'targets:',
        '  generic: generic.md',
        'drift_guard:',
        '  enabled: true',
        '  max_overlay_ratio: 0.4',
      ].join('\n'),
      baseContent: [
        '# Base',
        '<!-- mantra-lock:core:start -->',
        'locked line',
        '<!-- mantra-lock:core:end -->',
        'tail line',
      ].join('\n'),
      overlays: {
        'generic.md': 'overlay line\n',
      },
    })

    const result = runScript('validate-drift.ts', ['--json'], home, {
      MANTRA_USER_AGENTS_DIRS: agentsDir,
    })
    expect(result.raw.status, `${result.command}\n${result.stderr}`).toBe(0)

    const checked = result.jsonLines.find(
      line => line.type === 'drift_checked' && line.output_name === 'drift-pass-family',
    )
    expect(checked).toBeDefined()

    const summary = result.jsonLines.find(line => line.type === 'summary')
    expect(summary?.success).toBe(true)
    const details = summary?.details as Record<string, unknown> | undefined
    expect((details?.families_checked as number) ?? 0).toBeGreaterThanOrEqual(1)
    expect(details?.families_failed).toBe(0)
  })

  it('fails with E_FAMILY_DRIFT when overlay introduces conflicting lock markers', () => {
    const home = createTempHome('mantra-drift-lock-fail-')
    homes.push(home)

    const agentsDir = createTempDir('mantra-drift-lock-agents-')
    tempDirs.push(agentsDir)

    writeAgentFamily({
      agentsDir,
      familyName: 'drift-lock-fail',
      familyYml: [
        'description: drift lock fail',
        'targets:',
        '  generic: generic.md',
        'drift_guard:',
        '  enabled: true',
        '  max_overlay_ratio: 0.9',
      ].join('\n'),
      baseContent: [
        '# Base',
        '<!-- mantra-lock:core:start -->',
        'locked line',
        '<!-- mantra-lock:core:end -->',
      ].join('\n'),
      overlays: {
        'generic.md': [
          '<!-- mantra-lock:core:start -->',
          'changed line',
          '<!-- mantra-lock:core:end -->',
        ].join('\n'),
      },
    })

    const result = runScript('validate-drift.ts', ['--json'], home, {
      MANTRA_USER_AGENTS_DIRS: agentsDir,
    })
    expect(result.raw.status, `${result.command}\n${result.stderr}`).toBe(1)

    const driftError = result.jsonLines.find(
      line =>
        line.type === 'drift_error'
        && line.output_name === 'drift-lock-fail'
        && line.error_code === 'E_FAMILY_DRIFT',
    )
    expect(driftError).toBeDefined()

    const summary = result.jsonLines.find(line => line.type === 'summary')
    expect(summary?.success).toBe(false)
    expect(summary?.error_code).toBe('E_FAMILY_DRIFT')
    const details = summary?.details as Record<string, unknown> | undefined
    expect((details?.families_failed as number) ?? 0).toBeGreaterThanOrEqual(1)
  })

  it('fails with E_FAMILY_DRIFT when overlay ratio exceeds max_overlay_ratio', () => {
    const home = createTempHome('mantra-drift-ratio-fail-')
    homes.push(home)

    const agentsDir = createTempDir('mantra-drift-ratio-agents-')
    tempDirs.push(agentsDir)

    writeAgentFamily({
      agentsDir,
      familyName: 'drift-ratio-fail',
      familyYml: [
        'description: drift ratio fail',
        'targets:',
        '  generic: generic.md',
        'drift_guard:',
        '  enabled: true',
        '  max_overlay_ratio: 0.2',
      ].join('\n'),
      baseContent: ['base line one', 'base line two', 'base line three'].join('\n'),
      overlays: {
        'generic.md': ['overlay one', 'overlay two'].join('\n'),
      },
    })

    const result = runScript('validate-drift.ts', ['--json'], home, {
      MANTRA_USER_AGENTS_DIRS: agentsDir,
    })
    expect(result.raw.status, `${result.command}\n${result.stderr}`).toBe(1)

    const ratioError = result.jsonLines.find(
      line =>
        line.type === 'drift_error'
        && line.output_name === 'drift-ratio-fail'
        && line.violation_code === 'OVERLAY_RATIO_EXCEEDED',
    )
    expect(ratioError).toBeDefined()

    const summary = result.jsonLines.find(line => line.type === 'summary')
    expect(summary?.success).toBe(false)
    expect(summary?.error_code).toBe('E_FAMILY_DRIFT')
  })

  it('keeps backward compatibility when drift_guard is not configured', () => {
    const home = createTempHome('mantra-drift-compat-')
    homes.push(home)

    const agentsDir = createTempDir('mantra-drift-compat-agents-')
    tempDirs.push(agentsDir)

    writeAgentFamily({
      agentsDir,
      familyName: 'drift-compat-family',
      familyYml: [
        'description: drift compat',
        'targets:',
        '  generic: generic.md',
      ].join('\n'),
      baseContent: 'base only\n',
      overlays: {
        'generic.md': ['overlay one', 'overlay two', 'overlay three'].join('\n'),
      },
    })

    const result = runScript('validate-drift.ts', ['--json'], home, {
      MANTRA_USER_AGENTS_DIRS: agentsDir,
    })
    expect(result.raw.status, `${result.command}\n${result.stderr}`).toBe(0)

    const summary = result.jsonLines.find(line => line.type === 'summary')
    expect(summary?.success).toBe(true)
    const details = summary?.details as Record<string, unknown> | undefined
    expect((details?.families_checked as number) ?? 0).toBe(0)
    expect(details?.families_failed).toBe(0)
  })

  it('fails ratio check when base has no non-empty lines', () => {
    const home = createTempHome('mantra-drift-empty-base-')
    homes.push(home)

    const agentsDir = createTempDir('mantra-drift-empty-base-agents-')
    tempDirs.push(agentsDir)

    writeAgentFamily({
      agentsDir,
      familyName: 'drift-empty-base',
      familyYml: [
        'description: empty base drift',
        'targets:',
        '  generic: generic.md',
        'drift_guard:',
        '  enabled: true',
        '  max_overlay_ratio: 0.2',
      ].join('\n'),
      baseContent: '\n',
      overlays: {
        'generic.md': 'overlay-only-line\n',
      },
    })

    const result = runScript('validate-drift.ts', ['--json'], home, {
      MANTRA_USER_AGENTS_DIRS: agentsDir,
    })
    expect(result.raw.status, `${result.command}\n${result.stderr}`).toBe(1)

    const ratioError = result.jsonLines.find(
      line =>
        line.type === 'drift_error'
        && line.output_name === 'drift-empty-base'
        && line.violation_code === 'OVERLAY_RATIO_EXCEEDED',
    )
    expect(ratioError).toBeDefined()
  })

  it('checks non-agent families (rules) as well', () => {
    const home = createTempHome('mantra-drift-rules-pass-')
    homes.push(home)

    const rulesDir = createTempDir('mantra-drift-rules-dir-')
    tempDirs.push(rulesDir)

    writeAgentFamily({
      agentsDir: rulesDir,
      familyName: 'drift-rules-pass',
      familyYml: [
        'targets:',
        '  generic: generic.md',
        'drift_guard:',
        '  enabled: true',
        '  max_overlay_ratio: 0.5',
      ].join('\n'),
      baseContent: [
        '# Rule Base',
        '<!-- mantra-lock:rule:start -->',
        'immutable rule line',
        '<!-- mantra-lock:rule:end -->',
      ].join('\n'),
      overlays: {
        'generic.md': 'rule overlay line\n',
      },
    })

    const result = runScript('validate-drift.ts', ['--json'], home, {
      MANTRA_USER_RULES_DIRS: rulesDir,
    })
    expect(result.raw.status, `${result.command}\n${result.stderr}`).toBe(0)

    const checked = result.jsonLines.find(
      line =>
        line.type === 'drift_checked'
        && line.kind === 'rules'
        && line.output_name === 'drift-rules-pass',
    )
    expect(checked).toBeDefined()
  })
})
