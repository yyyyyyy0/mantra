import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildMergedDirectory } from '../scripts/lib/setup-merge'

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

describe('setup merge responsibilities', () => {
  const tempDirs: string[] = []
  const originalRootsEnv = process.env.MANTRA_USER_CONTENT_ROOTS
  const originalHome = process.env.HOME

  const withHome = (value: string) => {
    const previous = process.env.HOME
    process.env.HOME = value
    return () => {
      if (previous === undefined) {
        delete process.env.HOME
      } else {
        process.env.HOME = previous
      }
    }
  }

  beforeEach(() => {
    process.env.MANTRA_USER_CONTENT_ROOTS = ''
  })

  afterEach(() => {
    process.env.MANTRA_USER_CONTENT_ROOTS = originalRootsEnv
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
    while (tempDirs.length > 0) {
      fs.rmSync(tempDirs.pop() as string, { recursive: true, force: true })
    }
  })

  it('adds a warning when user source overrides core source for same filename', () => {
    const home = createTempDir('mantra-home-')
    const userRoot = createTempDir('mantra-user-root-')
    const userAgentsDir = path.join(userRoot, 'agents')
    tempDirs.push(home, userRoot)

    fs.mkdirSync(userAgentsDir, { recursive: true })
    fs.writeFileSync(
      path.join(userAgentsDir, 'planner.md'),
      '---\nname: planner\ndescription: User planner\ntools: []\n---\nBody\n',
      'utf8',
    )

    const restoreHome = withHome(home)
    process.env.MANTRA_USER_CONTENT_ROOTS = userRoot

    const result = buildMergedDirectory('agents', true)
    restoreHome()

    expect(result.files).toBeGreaterThan(0)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]?.winner).toBe('user')
    expect(result.warnings[0]?.loser).toBe('core')
    expect(result.warnings[0]?.target).toBe('planner.md')

    const mergedFiles = fs.readdirSync(path.join(home, '.mantra', 'generated', 'agents'))
    expect(mergedFiles).toContain('planner.md')
  })

  it('sets loser to user:<path> when duplicate filenames are in user roots', () => {
    const home = createTempDir('mantra-home-')
    const rootA = createTempDir('mantra-user-root-a-')
    const rootB = createTempDir('mantra-user-root-b-')
    const dirA = path.join(rootA, 'agents')
    const dirB = path.join(rootB, 'agents')
    tempDirs.push(home, rootA, rootB)

    fs.mkdirSync(dirA, { recursive: true })
    fs.mkdirSync(dirB, { recursive: true })
    fs.writeFileSync(path.join(dirA, 'both-user.md'), '---\nname: both\ndescription: A\ntools: []\n---\nA\n', 'utf8')
    fs.writeFileSync(path.join(dirB, 'both-user.md'), '---\nname: both\ndescription: B\ntools: []\n---\nB\n', 'utf8')

    const restoreHome = withHome(home)
    process.env.MANTRA_USER_CONTENT_ROOTS = `${rootA},${rootB}`

    const result = buildMergedDirectory('agents', true)
    restoreHome()

    const warning = result.warnings.find(w => w.target === 'both-user.md')
    expect(warning).toBeDefined()
    expect(warning?.winner).toBe('user')
    expect(warning?.loser).toBe(`user:${dirA}`)
  })

  it('writes composed family content using claude target fallback', () => {
    const home = createTempDir('mantra-home-')
    const userRoot = createTempDir('mantra-user-root-')
    const userAgentsDir = path.join(userRoot, 'agents')
    tempDirs.push(home, userRoot)

    fs.mkdirSync(userAgentsDir, { recursive: true })
    writeFamily({
      dir: userAgentsDir,
      name: 'family-merge-claude',
      familyYml: 'description: merge family\ntargets:\n  generic: generic.md\n',
      baseContent: 'base body',
      overlays: {
        'generic.md': 'generic overlay',
      },
    })

    const restoreHome = withHome(home)
    process.env.MANTRA_USER_CONTENT_ROOTS = userRoot

    const result = buildMergedDirectory('agents', true)
    restoreHome()

    expect(result.files).toBeGreaterThan(0)

    const mergedPath = path.join(home, '.mantra', 'generated', 'agents', 'family-merge-claude.md')
    expect(fs.existsSync(mergedPath)).toBe(true)
    expect(fs.lstatSync(mergedPath).isSymbolicLink()).toBe(false)
    expect(fs.readFileSync(mergedPath, 'utf8')).toBe('base body\ngeneric overlay')
  })

  it('emits warning metadata when family overrides legacy within the same source', () => {
    const home = createTempDir('mantra-home-')
    const userRoot = createTempDir('mantra-user-root-')
    const userAgentsDir = path.join(userRoot, 'agents')
    tempDirs.push(home, userRoot)

    fs.mkdirSync(userAgentsDir, { recursive: true })
    fs.writeFileSync(
      path.join(userAgentsDir, 'family-overrides-legacy.md'),
      '---\nname: family-overrides-legacy\ndescription: legacy\ntools: []\n---\nlegacy\n',
      'utf8',
    )
    writeFamily({
      dir: userAgentsDir,
      name: 'family-overrides-legacy',
      familyYml: 'description: override family\ntargets:\n  claude: claude.md\n',
      baseContent: 'base',
      overlays: {
        'claude.md': 'claude',
      },
    })

    const restoreHome = withHome(home)
    process.env.MANTRA_USER_CONTENT_ROOTS = userRoot

    const result = buildMergedDirectory('agents', true)
    restoreHome()

    const warning = result.warnings.find(w => w.target === 'family-overrides-legacy.md')
    expect(warning).toBeDefined()
    expect(warning?.winner).toBe('user')
    expect(warning?.loser).toBe(`user:${userAgentsDir}`)
    expect(warning?.message).toMatch(/family-over-legacy/)

    const mergedPath = path.join(home, '.mantra', 'generated', 'agents', 'family-overrides-legacy.md')
    expect(fs.readFileSync(mergedPath, 'utf8')).toBe('base\nclaude')
  })
})
