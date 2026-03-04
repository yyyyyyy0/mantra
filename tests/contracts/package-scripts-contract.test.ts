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

function parseSteps(script: string): string[] {
  return script
    .split('&&')
    .map(step => step.trim())
    .filter(Boolean)
}

function hasSyncCodexStep(steps: string[]): boolean {
  return steps.some(step => step.includes('sync:codex'))
}

describe('Package scripts contract', () => {
  it('keeps onboarding scripts split between core and full paths', () => {
    const scripts = loadScripts()

    const onboardingSteps = parseSteps(scripts.onboarding)
    const onboardingFullSteps = parseSteps(scripts['onboarding:full'])
    const onboardingJsonSteps = parseSteps(scripts['onboarding:json'])
    const onboardingFullJsonSteps = parseSteps(scripts['onboarding:full:json'])

    expect(onboardingSteps).toContain('npm run setup')
    expect(onboardingSteps).toContain('npm run validate')
    expect(hasSyncCodexStep(onboardingSteps)).toBe(false)

    expect(onboardingFullSteps).toContain('npm run setup')
    expect(onboardingFullSteps).toContain('npm run validate')
    expect(hasSyncCodexStep(onboardingFullSteps)).toBe(true)

    expect(onboardingJsonSteps).toContain('npm run setup -- --json')
    expect(onboardingJsonSteps).toContain('npm run validate:json')
    expect(hasSyncCodexStep(onboardingJsonSteps)).toBe(false)

    expect(onboardingFullJsonSteps).toContain('npm run setup -- --json')
    expect(onboardingFullJsonSteps).toContain('npm run validate:json')
    expect(onboardingFullJsonSteps).toContain('npm run sync:codex:json')
    expect(hasSyncCodexStep(onboardingFullJsonSteps)).toBe(true)
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

    const validateSteps = parseSteps(scripts.validate)
    const validateJsonSteps = parseSteps(scripts['validate:json'])

    expect(validateSteps).toContain('npm run validate:drift')
    expect(validateJsonSteps).toContain('npm run validate:drift -- --json')
  })
})
