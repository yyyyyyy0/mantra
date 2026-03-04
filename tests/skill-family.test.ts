import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { composeSkillFamily, loadSkillFamily } from '../scripts/lib/skill-family'

function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function writeFamily(args: {
  root: string
  name: string
  familyYml: string
  baseContent: string
  overlays?: Record<string, string>
}): string {
  const familyDir = path.join(args.root, `${args.name}.family`)
  fs.mkdirSync(path.join(familyDir, 'overlays'), { recursive: true })

  fs.writeFileSync(path.join(familyDir, 'family.yml'), args.familyYml, 'utf8')
  fs.writeFileSync(path.join(familyDir, 'base.md'), args.baseContent, 'utf8')

  for (const [name, content] of Object.entries(args.overlays ?? {})) {
    fs.writeFileSync(path.join(familyDir, 'overlays', name), content, 'utf8')
  }

  return familyDir
}

describe('skill family composition', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    while (tempDirs.length > 0) {
      fs.rmSync(tempDirs.pop() as string, { recursive: true, force: true })
    }
  })

  it('applies target -> generic -> base fallback', () => {
    const root = createTempDir('mantra-family-')
    tempDirs.push(root)

    const familyDir = writeFamily({
      root,
      name: 'fallback-agent',
      familyYml: 'targets:\n  generic: generic.md\n',
      baseContent: 'base body',
      overlays: {
        'generic.md': 'generic body',
      },
    })

    const family = loadSkillFamily(familyDir)
    const composed = composeSkillFamily(family, 'claude')

    expect(composed.overlayTarget).toBe('generic')
    expect(composed.content).toBe('base body\ngeneric body')
  })

  it('uses base only when no overlays are configured', () => {
    const root = createTempDir('mantra-family-')
    tempDirs.push(root)

    const familyDir = writeFamily({
      root,
      name: 'base-only-agent',
      familyYml: 'targets: {}\n',
      baseContent: 'base only body',
    })

    const family = loadSkillFamily(familyDir)
    const composed = composeSkillFamily(family, 'codex')

    expect(composed.overlayTarget).toBeUndefined()
    expect(composed.content).toBe('base only body')
  })

  it('rejects absolute overlay paths', () => {
    const root = createTempDir('mantra-family-')
    tempDirs.push(root)

    const familyDir = writeFamily({
      root,
      name: 'invalid-path-agent',
      familyYml: `targets:\n  claude: ${path.join(root, 'outside.md')}\n`,
      baseContent: 'base body',
    })

    expect(() => loadSkillFamily(familyDir)).toThrowError(/相対パス/)
  })
})
