import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listContentEntries } from '../scripts/lib/content-entries'

function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function writeFamily(args: {
  dir: string
  name: string
  familyYml: string
  baseContent: string
  overlays?: Record<string, string>
}): void {
  const familyDir = path.join(args.dir, `${args.name}.family`)
  fs.mkdirSync(path.join(familyDir, 'overlays'), { recursive: true })

  fs.writeFileSync(path.join(familyDir, 'family.yml'), args.familyYml, 'utf8')
  fs.writeFileSync(path.join(familyDir, 'base.md'), args.baseContent, 'utf8')

  for (const [name, content] of Object.entries(args.overlays ?? {})) {
    fs.writeFileSync(path.join(familyDir, 'overlays', name), content, 'utf8')
  }
}

describe('content entries', () => {
  const tempDirs: string[] = []
  const originalRootsEnv = process.env.MANTRA_USER_CONTENT_ROOTS

  beforeEach(() => {
    process.env.MANTRA_USER_CONTENT_ROOTS = ''
  })

  afterEach(() => {
    process.env.MANTRA_USER_CONTENT_ROOTS = originalRootsEnv
    while (tempDirs.length > 0) {
      fs.rmSync(tempDirs.pop() as string, { recursive: true, force: true })
    }
  })

  it('composes family content for claude target using generic fallback', () => {
    const root = createTempDir('mantra-content-entries-')
    tempDirs.push(root)

    const agentsDir = path.join(root, 'agents')
    fs.mkdirSync(agentsDir, { recursive: true })

    writeFamily({
      dir: agentsDir,
      name: 'family-fallback-only',
      familyYml: 'targets:\n  generic: generic.md\n',
      baseContent: 'base block',
      overlays: {
        'generic.md': 'generic block',
      },
    })

    process.env.MANTRA_USER_CONTENT_ROOTS = root

    const result = listContentEntries('agents', { target: 'claude' })
    const entry = result.entries.find(
      item => item.source.dir === agentsDir && item.relativeName === 'family-fallback-only.md',
    )

    expect(entry).toBeDefined()
    expect(entry?.entryKind).toBe('family')
    if (entry?.entryKind !== 'family') {
      throw new Error('expected family entry')
    }
    expect(entry.composedTarget).toBe('generic')
    expect(entry.composedContent).toBe('base block\ngeneric block')
  })

  it('prefers family over legacy in same source and emits warning hook metadata', () => {
    const root = createTempDir('mantra-content-entries-')
    tempDirs.push(root)

    const agentsDir = path.join(root, 'agents')
    fs.mkdirSync(agentsDir, { recursive: true })

    fs.writeFileSync(
      path.join(agentsDir, 'family-conflict-entry.md'),
      '---\nname: family-conflict-entry\ndescription: legacy\ntools: []\n---\nlegacy\n',
      'utf8',
    )

    writeFamily({
      dir: agentsDir,
      name: 'family-conflict-entry',
      familyYml: 'targets:\n  claude: claude.md\n',
      baseContent: 'base content',
      overlays: {
        'claude.md': 'claude only',
      },
    })

    process.env.MANTRA_USER_CONTENT_ROOTS = root

    const result = listContentEntries('agents', { target: 'claude' })

    const entry = result.entries.find(
      item => item.source.dir === agentsDir && item.relativeName === 'family-conflict-entry.md',
    )

    expect(entry).toBeDefined()
    expect(entry?.entryKind).toBe('family')
    expect(result.warningHooks).toHaveLength(1)
    expect(result.warningHooks[0]?.policy).toBe('family-over-legacy')
    expect(result.warningHooks[0]?.target).toBe('family-conflict-entry.md')
    expect(result.warningHooks[0]?.source.dir).toBe(agentsDir)
  })

  it('keeps deterministic source ordering in returned entries', () => {
    const rootA = createTempDir('mantra-content-entries-a-')
    const rootB = createTempDir('mantra-content-entries-b-')
    tempDirs.push(rootA, rootB)

    const agentsDirA = path.join(rootA, 'agents')
    const agentsDirB = path.join(rootB, 'agents')
    fs.mkdirSync(agentsDirA, { recursive: true })
    fs.mkdirSync(agentsDirB, { recursive: true })

    writeFamily({
      dir: agentsDirA,
      name: 'deterministic-family',
      familyYml: 'targets:\n  generic: generic.md\n',
      baseContent: 'A base',
      overlays: {
        'generic.md': 'A overlay',
      },
    })

    writeFamily({
      dir: agentsDirB,
      name: 'deterministic-family',
      familyYml: 'targets:\n  generic: generic.md\n',
      baseContent: 'B base',
      overlays: {
        'generic.md': 'B overlay',
      },
    })

    process.env.MANTRA_USER_CONTENT_ROOTS = `${rootA},${rootB}`

    const result = listContentEntries('agents', { target: 'generic' })
    const matching = result.entries.filter(entry => entry.relativeName === 'deterministic-family.md')

    expect(matching).toHaveLength(2)
    expect(matching[0]?.source.dir).toBe(agentsDirA)
    expect(matching[1]?.source.dir).toBe(agentsDirB)
  })
})
