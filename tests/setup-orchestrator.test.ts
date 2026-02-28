import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildSetupLinks } from '../scripts/lib/setup-orchestrator'

function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

describe('setup orchestration', () => {
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

  it('uses core directories when no user sources exist', () => {
    const home = createTempDir('mantra-home-')
    tempDirs.push(home)
    const restoreHome = withHome(home)
    process.env.MANTRA_USER_CONTENT_ROOTS = ''

    const plan = buildSetupLinks(false)
    restoreHome()

    expect(plan.links).toHaveLength(2)
    expect(plan.warnings).toHaveLength(0)
    expect(plan.mergedKinds).toHaveLength(0)
    expect(plan.links[0].dest).toBe(path.join(home, '.claude', 'agents'))
    expect(plan.links[1].dest).toBe(path.join(home, '.claude', 'rules'))
    expect(plan.links[0].src).toBe(path.join(process.cwd(), 'agents'))
    expect(plan.links[1].src).toBe(path.join(process.cwd(), 'rules'))
  })

  it('creates merged agent source only when user agents are defined', () => {
    const home = createTempDir('mantra-home-')
    const userRoot = createTempDir('mantra-user-root-')
    const userAgentsDir = path.join(userRoot, 'agents')
    tempDirs.push(home, userRoot)

    fs.mkdirSync(userAgentsDir, { recursive: true })
    fs.writeFileSync(
      path.join(userAgentsDir, 'planner-user.md'),
      '---\nname: planner-user\ndescription: User planner\ntools: []\n---\nBody\n',
      'utf8',
    )

    const restoreHome = withHome(home)
    process.env.MANTRA_USER_CONTENT_ROOTS = userRoot

    const plan = buildSetupLinks(true)
    restoreHome()

    expect(plan.links).toHaveLength(2)
    expect(plan.links[0].src).toBe(path.join(home, '.mantra', 'generated', 'agents'))
    expect(plan.links[1].src).toBe(path.join(process.cwd(), 'rules'))
    expect(plan.warnings).toHaveLength(0)
    expect(plan.mergedKinds).toHaveLength(1)
    expect(plan.mergedKinds[0]).toMatchObject({ kind: 'agents' })
  })
})
