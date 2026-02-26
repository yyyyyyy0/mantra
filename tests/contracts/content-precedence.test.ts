import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createTempHome, removeTempHome, runScript } from '../helpers/cli-runner'

function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

describe('Content precedence contract', () => {
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

  it('user-defined content overrides same-name core content (winner: user, loser: core)', () => {
    const home = createTempHome('mantra-prec-')
    homes.push(home)

    const userRoot = createTempDir('mantra-user-root-')
    tempDirs.push(userRoot)

    const userAgentsDir = path.join(userRoot, 'agents')
    fs.mkdirSync(userAgentsDir, { recursive: true })
    // planner.md はコアにも存在するファイル名
    fs.writeFileSync(
      path.join(userAgentsDir, 'planner.md'),
      '---\nname: planner\ndescription: User override\ntools: []\n---\nUser planner body\n',
      'utf8',
    )

    const result = runScript('setup.ts', ['--json'], home, {
      MANTRA_USER_CONTENT_ROOTS: userRoot,
    })

    expect(result.raw.status, result.stderr).toBe(0)

    const warningLine = result.jsonLines.find(
      line => line.type === 'warning' && line.code === 'W_SOURCE_CONFLICT_FILENAME',
    )
    expect(warningLine).toBeDefined()
    expect(warningLine?.winner).toBe('user')
    expect(warningLine?.loser).toBe('core')
    expect(warningLine?.target).toBe('planner.md')
  })

  it('emits W_SOURCE_CONFLICT_FILENAME warning on filename conflict', () => {
    const home = createTempHome('mantra-warn-')
    homes.push(home)

    const userRoot = createTempDir('mantra-user-conflict-')
    tempDirs.push(userRoot)

    const userAgentsDir = path.join(userRoot, 'agents')
    fs.mkdirSync(userAgentsDir, { recursive: true })
    fs.writeFileSync(
      path.join(userAgentsDir, 'planner.md'),
      '---\nname: planner\ndescription: Conflict test\ntools: []\n---\nBody\n',
      'utf8',
    )

    const result = runScript('setup.ts', ['--json'], home, {
      MANTRA_USER_CONTENT_ROOTS: userRoot,
    })

    expect(result.raw.status, result.stderr).toBe(0)

    const warnings = result.jsonLines.filter(
      line => line.type === 'warning' && line.code === 'W_SOURCE_CONFLICT_FILENAME',
    )
    expect(warnings.length).toBeGreaterThanOrEqual(1)

    const summary = result.jsonLines.find(line => line.type === 'summary')
    expect(summary?.warning_count).toBeGreaterThanOrEqual(1)
    expect(Array.isArray(summary?.warning_types)).toBe(true)
    expect((summary?.warning_types as string[]).includes('W_SOURCE_CONFLICT_FILENAME')).toBe(true)
  })

  it('uses user:<path> as loser when two sources.json user roots conflict on the same filename', () => {
    const home = createTempHome('mantra-srcjson-user-user-')
    homes.push(home)

    const userRootA = fs.mkdtempSync(path.join(home, 'mantra-root-a-'))
    const userRootB = fs.mkdtempSync(path.join(home, 'mantra-root-b-'))
    const userAgentsDirA = path.join(userRootA, 'agents')
    const userAgentsDirB = path.join(userRootB, 'agents')

    fs.mkdirSync(userAgentsDirA, { recursive: true })
    fs.mkdirSync(userAgentsDirB, { recursive: true })

    fs.writeFileSync(
      path.join(userAgentsDirA, 'same-file-across-roots.md'),
      '---\nname: same-file-across-roots\ndescription: Root A\ntools: []\n---\nBody\n',
      'utf8',
    )
    fs.writeFileSync(
      path.join(userAgentsDirB, 'same-file-across-roots.md'),
      '---\nname: same-file-across-roots\ndescription: Root B\ntools: []\n---\nBody\n',
      'utf8',
    )

    const configDir = path.join(home, '.config', 'mantra')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      path.join(configDir, 'sources.json'),
      JSON.stringify({ roots: [userRootA, userRootB] }),
      'utf8',
    )

    const result = runScript('setup.ts', ['--json'], home)

    expect(result.raw.status, result.stderr).toBe(0)

    const warningLine = result.jsonLines.find(
      line =>
        line.type === 'warning' &&
        line.code === 'W_SOURCE_CONFLICT_FILENAME' &&
        line.target === 'same-file-across-roots.md',
    )
    expect(warningLine).toBeDefined()
    expect(warningLine?.winner).toBe('user')
    expect(warningLine?.loser).toBe(`user:${userAgentsDirA}`)
  })

  it('emits no warnings when there are no filename conflicts', () => {
    const home = createTempHome('mantra-nowarn-')
    homes.push(home)

    const userRoot = createTempDir('mantra-user-unique-')
    tempDirs.push(userRoot)

    const userAgentsDir = path.join(userRoot, 'agents')
    fs.mkdirSync(userAgentsDir, { recursive: true })
    // コアに存在しないユニークなファイル名
    fs.writeFileSync(
      path.join(userAgentsDir, 'unique-custom-agent-xyz.md'),
      '---\nname: unique-custom-agent-xyz\ndescription: Unique agent\ntools: []\n---\nBody\n',
      'utf8',
    )

    const result = runScript('setup.ts', ['--json'], home, {
      MANTRA_USER_CONTENT_ROOTS: userRoot,
    })

    expect(result.raw.status, result.stderr).toBe(0)

    const warnings = result.jsonLines.filter(line => line.type === 'warning')
    expect(warnings.length).toBe(0)

    const summary = result.jsonLines.find(line => line.type === 'summary')
    expect(summary?.warning_count).toBeUndefined()
  })

  it('emits W_SOURCE_CONFLICT_FILENAME warning when conflict is introduced via sources.json roots', () => {
    const home = createTempHome('mantra-srcjson-conflict-')
    homes.push(home)

    // HOME 配下に root を作って sources.json から読み込ませる
    const userRoot = fs.mkdtempSync(path.join(home, 'mantra-user-root-'))
    const userAgentsDir = path.join(userRoot, 'agents')
    fs.mkdirSync(userAgentsDir, { recursive: true })
    fs.writeFileSync(
      path.join(userAgentsDir, 'planner.md'),
      '---\nname: planner\ndescription: Conflict from sources.json\ntools: []\n---\nBody\n',
      'utf8',
    )

    const configDir = path.join(home, '.config', 'mantra')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      path.join(configDir, 'sources.json'),
      JSON.stringify({ roots: [userRoot] }),
      'utf8',
    )

    const result = runScript('setup.ts', ['--json'], home)

    expect(result.raw.status, result.stderr).toBe(0)

    const warningLine = result.jsonLines.find(
      line => line.type === 'warning' && line.code === 'W_SOURCE_CONFLICT_FILENAME',
    )
    expect(warningLine).toBeDefined()
    expect(warningLine?.winner).toBe('user')
    expect(warningLine?.loser).toBe('core')
    expect(warningLine?.target).toBe('planner.md')

    const summary = result.jsonLines.find(line => line.type === 'summary')
    expect(summary?.warning_count).toBeGreaterThanOrEqual(1)
    expect(Array.isArray(summary?.warning_types)).toBe(true)
    expect((summary?.warning_types as string[]).includes('W_SOURCE_CONFLICT_FILENAME')).toBe(true)
  })

  it('sources.json roots are loaded and reflected in the merged directory', () => {
    const home = createTempHome('mantra-srcjson-')
    homes.push(home)

    const userRoot = createTempDir('mantra-srcjson-root-')
    tempDirs.push(userRoot)

    const userAgentsDir = path.join(userRoot, 'agents')
    fs.mkdirSync(userAgentsDir, { recursive: true })
    fs.writeFileSync(
      path.join(userAgentsDir, 'srcjson-agent.md'),
      '---\nname: srcjson-agent\ndescription: From sources.json\ntools: []\n---\nBody\n',
      'utf8',
    )

    // sources.json を HOME/.config/mantra/ に配置
    const configDir = path.join(home, '.config', 'mantra')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      path.join(configDir, 'sources.json'),
      JSON.stringify({ roots: [userRoot] }),
      'utf8',
    )

    const result = runScript('setup.ts', ['--json'], home)

    expect(result.raw.status, result.stderr).toBe(0)
    const summary = result.jsonLines.find(line => line.type === 'summary')
    expect(summary?.success).toBe(true)

    const mergedAgentsDir = path.join(home, '.mantra', 'generated', 'agents')
    const mergedFiles = fs.readdirSync(mergedAgentsDir)
    expect(mergedFiles.includes('srcjson-agent.md')).toBe(true)
  })

  it('sources.json takes precedence over env vars (env-only file not present in merged)', () => {
    const home = createTempHome('mantra-srcjson-prec-')
    homes.push(home)

    const userRootFromSrcJson = createTempDir('mantra-from-srcjson-')
    tempDirs.push(userRootFromSrcJson)

    const userRootFromEnv = createTempDir('mantra-from-env-')
    tempDirs.push(userRootFromEnv)

    // sources.json 用のエージェント
    const srcJsonAgentsDir = path.join(userRootFromSrcJson, 'agents')
    fs.mkdirSync(srcJsonAgentsDir, { recursive: true })
    fs.writeFileSync(
      path.join(srcJsonAgentsDir, 'from-srcjson-agent.md'),
      '---\nname: from-srcjson-agent\ndescription: From sources.json root\ntools: []\n---\nBody\n',
      'utf8',
    )

    // env 用のエージェント（sources.json がある場合は無視されるべき）
    const envAgentsDir = path.join(userRootFromEnv, 'agents')
    fs.mkdirSync(envAgentsDir, { recursive: true })
    fs.writeFileSync(
      path.join(envAgentsDir, 'from-env.md'),
      '---\nname: from-env\ndescription: From env root\ntools: []\n---\nBody\n',
      'utf8',
    )

    // sources.json を HOME/.config/mantra/ に配置
    const configDir = path.join(home, '.config', 'mantra')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      path.join(configDir, 'sources.json'),
      JSON.stringify({ roots: [userRootFromSrcJson] }),
      'utf8',
    )

    // env でも別のルートを指定（sources.json があるので無視されるはず）
    const result = runScript('setup.ts', ['--json'], home, {
      MANTRA_USER_CONTENT_ROOTS: userRootFromEnv,
    })

    expect(result.raw.status, result.stderr).toBe(0)

    const mergedAgentsDir = path.join(home, '.mantra', 'generated', 'agents')
    const mergedFiles = fs.readdirSync(mergedAgentsDir)

    // sources.json 由来のファイルは含まれる
    expect(mergedFiles.includes('from-srcjson-agent.md')).toBe(true)
    // env 由来のファイルは含まれない
    expect(mergedFiles.includes('from-env.md')).toBe(false)
  })

  it('returns E_INPUT_INVALID when sources.json contains malformed JSON', () => {
    const home = createTempHome('mantra-srcjson-invalid-')
    homes.push(home)

    const configDir = path.join(home, '.config', 'mantra')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(path.join(configDir, 'sources.json'), '{ invalid json', 'utf8')

    const result = runScript('setup.ts', ['--json'], home)

    expect(result.raw.status).toBe(1)

    const summary = result.jsonLines.find(line => line.type === 'summary')
    expect(summary?.success).toBe(false)
    expect(summary?.error_code).toBe('E_INPUT_INVALID')
  })
})
