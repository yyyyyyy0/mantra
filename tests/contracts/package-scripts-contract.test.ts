import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'

function loadScripts(): Record<string, string> {
  const packageJsonPath = path.join(process.cwd(), 'package.json')
  const packageJsonRaw = fs.readFileSync(packageJsonPath, 'utf8')
  const packageJson = JSON.parse(packageJsonRaw) as { scripts?: Record<string, string> }

  if (packageJson.scripts === undefined) {
    throw new Error('package.json scripts not found')
  }

  return packageJson.scripts
}

describe('Package scripts contract', () => {
  it('routes onboarding scripts through the wrapper with stable public names', () => {
    const scripts = loadScripts()

    expect(scripts.onboarding).toBe('tsx scripts/onboarding.ts')
    expect(scripts['onboarding:full']).toBe('tsx scripts/onboarding.ts --full')
    expect(scripts['onboarding:json']).toBe('tsx scripts/onboarding.ts --json')
    expect(scripts['onboarding:full:json']).toBe('tsx scripts/onboarding.ts --full --json')
    expect(scripts['metrics:report']).toBe('tsx scripts/metrics-report.ts')
  })

  it('declares typecheck and lint quality gates', () => {
    const scripts = loadScripts()

    expect(typeof scripts.typecheck).toBe('string')
    expect(scripts.typecheck.length).toBeGreaterThan(0)
    expect(scripts.typecheck.includes('tsc')).toBe(true)

    expect(typeof scripts.lint).toBe('string')
    expect(scripts.lint.length).toBeGreaterThan(0)
    expect(scripts.lint.includes('eslint')).toBe(true)
    expect(scripts.lint.includes('--max-warnings=0')).toBe(true)
  })

  it('includes validate:drift in validate aggregates', () => {
    const scripts = loadScripts()

    expect(scripts.validate.includes('npm run validate:drift')).toBe(true)
    expect(scripts['validate:json'].includes('npm run validate:drift -- --json')).toBe(true)
  })
})
