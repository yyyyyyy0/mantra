import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildMergedDirectory } from '../scripts/lib/setup-merge'

function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
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
})
