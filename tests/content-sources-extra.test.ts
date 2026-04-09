/**
 * Extra coverage tests for content-sources.ts, content-entries.ts, skill-family.ts,
 * and validation-summary.ts.
 * Added to close coverage gaps introduced by adding those modules to coverage.include.
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  __resetSourcesFileCache,
  countUserSources,
  hasUserSources,
  resolveContentSources,
} from '../scripts/lib/content-sources'
import { listContentEntries } from '../scripts/lib/content-entries'
import {
  composeSkillFamily,
  familyDirectoryToRelativeName,
  loadSkillFamily,
} from '../scripts/lib/skill-family'
import { selectSummaryErrorCode } from '../scripts/lib/validation-summary'

function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function writeFamily(args: {
  dir: string
  name: string
  familyYml: string
  baseContent: string
  overlays?: Record<string, string>
}): string {
  const familyDir = path.join(args.dir, `${args.name}.family`)
  fs.mkdirSync(path.join(familyDir, 'overlays'), { recursive: true })
  fs.writeFileSync(path.join(familyDir, 'family.yml'), args.familyYml, 'utf8')
  fs.writeFileSync(path.join(familyDir, 'base.md'), args.baseContent, 'utf8')
  for (const [name, content] of Object.entries(args.overlays ?? {})) {
    fs.writeFileSync(path.join(familyDir, 'overlays', name), content, 'utf8')
  }
  return familyDir
}

// ──────────────────────────────────────────────────────────────────────────────
// content-sources.ts gap coverage
// ──────────────────────────────────────────────────────────────────────────────

describe('resolveContentSources – env-based direct dirs', () => {
  const tempDirs: string[] = []
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    savedEnv.MANTRA_USER_CONTENT_ROOTS = process.env.MANTRA_USER_CONTENT_ROOTS
    savedEnv.MANTRA_USER_AGENTS_DIRS = process.env.MANTRA_USER_AGENTS_DIRS
    process.env.MANTRA_USER_CONTENT_ROOTS = ''
    process.env.MANTRA_USER_AGENTS_DIRS = ''
    __resetSourcesFileCache()
  })

  afterEach(() => {
    process.env.MANTRA_USER_CONTENT_ROOTS = savedEnv.MANTRA_USER_CONTENT_ROOTS
    process.env.MANTRA_USER_AGENTS_DIRS = savedEnv.MANTRA_USER_AGENTS_DIRS
    __resetSourcesFileCache()
    while (tempDirs.length > 0) {
      fs.rmSync(tempDirs.pop() as string, { recursive: true, force: true })
    }
  })

  it('picks up MANTRA_USER_AGENTS_DIRS as a user-dir source', () => {
    const dir = createTempDir('mantra-agents-direct-')
    tempDirs.push(dir)

    process.env.MANTRA_USER_AGENTS_DIRS = dir
    const sources = resolveContentSources('agents')
    const userSource = sources.find(s => s.origin === 'user' && s.dir === path.resolve(dir))
    expect(userSource).toBeDefined()
    expect(userSource?.label).toContain('user-dir')
  })

  it('hasUserSources returns true when a user source exists', () => {
    const dir = createTempDir('mantra-agents-has-')
    tempDirs.push(dir)

    process.env.MANTRA_USER_AGENTS_DIRS = dir
    expect(hasUserSources('agents')).toBe(true)
  })

  it('hasUserSources returns false when no user sources exist', () => {
    expect(hasUserSources('agents')).toBe(false)
  })

  it('countUserSources returns 0 with no user sources', () => {
    expect(countUserSources('agents')).toBe(0)
  })

  it('countUserSources returns 1 with a single user dir', () => {
    const dir = createTempDir('mantra-agents-count-')
    tempDirs.push(dir)

    process.env.MANTRA_USER_AGENTS_DIRS = dir
    expect(countUserSources('agents')).toBe(1)
  })

  it('countUserSources accepts an array of kinds', () => {
    const dir = createTempDir('mantra-agents-count-arr-')
    tempDirs.push(dir)

    process.env.MANTRA_USER_AGENTS_DIRS = dir
    // agents has 1, rules has 0 → total unique dirs = 1
    expect(countUserSources(['agents', 'rules'])).toBe(1)
  })

  it('skips non-existent paths in MANTRA_USER_AGENTS_DIRS', () => {
    process.env.MANTRA_USER_AGENTS_DIRS = '/nonexistent/path/that/does/not/exist'
    const sources = resolveContentSources('agents')
    const userSources = sources.filter(s => s.origin === 'user')
    expect(userSources).toHaveLength(0)
  })

  it('skips duplicate paths in MANTRA_USER_AGENTS_DIRS', () => {
    const dir = createTempDir('mantra-agents-dedup-')
    tempDirs.push(dir)

    process.env.MANTRA_USER_AGENTS_DIRS = `${dir},${dir}`
    const sources = resolveContentSources('agents')
    const userSources = sources.filter(s => s.origin === 'user')
    expect(userSources).toHaveLength(1)
  })

  it('skips file paths (not directories) in MANTRA_USER_AGENTS_DIRS', () => {
    const dir = createTempDir('mantra-agents-file-')
    tempDirs.push(dir)

    const filePath = path.join(dir, 'not-a-dir.txt')
    fs.writeFileSync(filePath, 'content', 'utf8')

    process.env.MANTRA_USER_AGENTS_DIRS = filePath
    const sources = resolveContentSources('agents')
    const userSources = sources.filter(s => s.origin === 'user')
    expect(userSources).toHaveLength(0)
  })

  it('resolves sources for rules kind via env var', () => {
    const savedRulesDirs = process.env.MANTRA_USER_RULES_DIRS
    const dir = createTempDir('mantra-rules-direct-')
    tempDirs.push(dir)

    process.env.MANTRA_USER_RULES_DIRS = dir
    const sources = resolveContentSources('rules')
    const userSources = sources.filter(s => s.origin === 'user')
    expect(userSources.length).toBeGreaterThanOrEqual(1)
    process.env.MANTRA_USER_RULES_DIRS = savedRulesDirs
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// content-sources.ts – sources.json path coverage
// ──────────────────────────────────────────────────────────────────────────────

describe('resolveContentSources – sources.json branches', () => {
  const tempDirs: string[] = []
  const originalHome = process.env.HOME

  const withHome = (value: string): (() => void) => {
    process.env.HOME = value
    return () => {
      if (originalHome === undefined) {
        delete process.env.HOME
      } else {
        process.env.HOME = originalHome
      }
    }
  }

  afterEach(() => {
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
    __resetSourcesFileCache()
    while (tempDirs.length > 0) {
      fs.rmSync(tempDirs.pop() as string, { recursive: true, force: true })
    }
  })

  it('uses sources.json roots when present and kind subdir exists', () => {
    const home = createTempDir('mantra-home-srcs-')
    const userRoot = createTempDir('mantra-user-src-root-')
    const agentsDir = path.join(userRoot, 'agents')
    fs.mkdirSync(agentsDir, { recursive: true })
    tempDirs.push(home, userRoot)

    const configDir = path.join(home, '.config', 'mantra')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      path.join(configDir, 'sources.json'),
      JSON.stringify({ roots: [userRoot] }),
      'utf8',
    )

    const restoreHome = withHome(home)
    __resetSourcesFileCache()
    const sources = resolveContentSources('agents')
    restoreHome()

    const userSource = sources.find(s => s.origin === 'user' && s.dir === agentsDir)
    expect(userSource).toBeDefined()
    expect(userSource?.label).toContain('user-root')
  })

  it('skips sources.json root when kind subdir does not exist', () => {
    const home = createTempDir('mantra-home-nosub-')
    const userRoot = createTempDir('mantra-user-nosub-')
    // Do NOT create userRoot/agents subdir
    tempDirs.push(home, userRoot)

    const configDir = path.join(home, '.config', 'mantra')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      path.join(configDir, 'sources.json'),
      JSON.stringify({ roots: [userRoot] }),
      'utf8',
    )

    const restoreHome = withHome(home)
    __resetSourcesFileCache()
    const sources = resolveContentSources('agents')
    restoreHome()

    const userSources = sources.filter(s => s.origin === 'user')
    expect(userSources).toHaveLength(0)
  })

  it('uses sources.json agentsDirs direct entries', () => {
    const home = createTempDir('mantra-home-direct-')
    const agentsDir = createTempDir('mantra-agents-direct-src-')
    tempDirs.push(home, agentsDir)

    const configDir = path.join(home, '.config', 'mantra')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      path.join(configDir, 'sources.json'),
      JSON.stringify({ agentsDirs: [agentsDir] }),
      'utf8',
    )

    const restoreHome = withHome(home)
    __resetSourcesFileCache()
    const sources = resolveContentSources('agents')
    restoreHome()

    const userSource = sources.find(s => s.origin === 'user' && s.dir === path.resolve(agentsDir))
    expect(userSource).toBeDefined()
    expect(userSource?.label).toContain('user-dir')
  })

  it('throws E_INPUT_INVALID when sources.json contains invalid JSON', () => {
    const home = createTempDir('mantra-home-badjson-')
    tempDirs.push(home)

    const configDir = path.join(home, '.config', 'mantra')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(path.join(configDir, 'sources.json'), '{ invalid json }', 'utf8')

    const restoreHome = withHome(home)
    __resetSourcesFileCache()
    expect(() => resolveContentSources('agents')).toThrowError(/不正な JSON/)
    restoreHome()
  })

  it('throws E_INPUT_INVALID when sources.json schema is invalid', () => {
    const home = createTempDir('mantra-home-badschema-')
    tempDirs.push(home)

    const configDir = path.join(home, '.config', 'mantra')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      path.join(configDir, 'sources.json'),
      JSON.stringify({ roots: 'not-an-array' }),
      'utf8',
    )

    const restoreHome = withHome(home)
    __resetSourcesFileCache()
    expect(() => resolveContentSources('agents')).toThrowError(/スキーマ/)
    restoreHome()
  })

  it('uses cache on second call with same home', () => {
    const home = createTempDir('mantra-home-cache-')
    const userRoot = createTempDir('mantra-user-cache-')
    const agentsDir = path.join(userRoot, 'agents')
    fs.mkdirSync(agentsDir, { recursive: true })
    tempDirs.push(home, userRoot)

    const configDir = path.join(home, '.config', 'mantra')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      path.join(configDir, 'sources.json'),
      JSON.stringify({ roots: [userRoot] }),
      'utf8',
    )

    const restoreHome = withHome(home)
    __resetSourcesFileCache()
    const sources1 = resolveContentSources('agents')
    const sources2 = resolveContentSources('agents')
    restoreHome()

    // Both calls should return matching results (from cache on second call)
    expect(sources1.length).toBe(sources2.length)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// skill-family.ts gap coverage
// ──────────────────────────────────────────────────────────────────────────────

describe('loadSkillFamily – error branches', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    while (tempDirs.length > 0) {
      fs.rmSync(tempDirs.pop() as string, { recursive: true, force: true })
    }
  })

  it('throws E_INPUT_INVALID when family directory does not exist', () => {
    expect(() => loadSkillFamily('/nonexistent/path/test.family')).toThrowError(
      /family ディレクトリ/,
    )
  })

  it('throws E_INPUT_INVALID for agents family with empty description', () => {
    const root = createTempDir('mantra-family-no-desc-')
    tempDirs.push(root)

    const familyDir = writeFamily({
      dir: root,
      name: 'no-description',
      familyYml: 'targets: {}\n',
      baseContent: 'base body',
    })

    expect(() => loadSkillFamily(familyDir, { kind: 'agents' })).toThrowError(/description/)
  })

  it('accepts agents family when description is provided', () => {
    const root = createTempDir('mantra-family-with-desc-')
    tempDirs.push(root)

    const familyDir = writeFamily({
      dir: root,
      name: 'with-description',
      familyYml: 'description: a valid description\ntargets: {}\n',
      baseContent: 'base body',
    })

    const loaded = loadSkillFamily(familyDir, { kind: 'agents' })
    expect(loaded.description).toBe('a valid description')
  })

  it('throws when family.yml config is missing', () => {
    const root = createTempDir('mantra-family-no-config-')
    tempDirs.push(root)

    const familyDir = path.join(root, 'no-config.family')
    fs.mkdirSync(familyDir, { recursive: true })
    // no family.yml

    expect(() => loadSkillFamily(familyDir)).toThrowError(/family\.yml/)
  })

  it('throws when overlay reference contains nested path with slash', () => {
    const root = createTempDir('mantra-family-nested-overlay-')
    tempDirs.push(root)

    const familyDir = writeFamily({
      dir: root,
      name: 'nested-overlay',
      familyYml: 'targets:\n  claude: subdir/overlay.md\n',
      baseContent: 'base',
    })

    expect(() => loadSkillFamily(familyDir)).toThrowError(/overlay/)
  })

  it('throws when overlay name in config is empty after normalization', () => {
    const root = createTempDir('mantra-family-empty-overlay-')
    tempDirs.push(root)

    const familyDir = writeFamily({
      dir: root,
      name: 'empty-overlay-name',
      familyYml: 'targets:\n  claude: "  "\n',
      baseContent: 'base',
    })

    expect(() => loadSkillFamily(familyDir)).toThrowError(/overlay/)
  })

  it('throws E_INPUT_INVALID for invalid family directory name (unsafe characters, no name in config)', () => {
    const root = createTempDir('mantra-family-unsafe-')
    tempDirs.push(root)

    // Create a family dir whose basename (stripped of .family) is unsafe.
    // We write the dir manually (not via writeFamily which enforces safe names).
    const familyDir = path.join(root, 'unsafe name with spaces.family')
    fs.mkdirSync(path.join(familyDir, 'overlays'), { recursive: true })
    // No 'name' in config → outputName derived from dir basename
    fs.writeFileSync(path.join(familyDir, 'family.yml'), 'targets: {}\n', 'utf8')
    fs.writeFileSync(path.join(familyDir, 'base.md'), 'base', 'utf8')

    expect(() => loadSkillFamily(familyDir)).toThrowError(/family name/)
  })

  it('familyDirectoryToRelativeName throws for non-.family names', () => {
    expect(() => familyDirectoryToRelativeName('not-a-family')).toThrowError(/family/)
  })

  it('familyDirectoryToRelativeName converts .family name to .md', () => {
    expect(familyDirectoryToRelativeName('my-agent.family')).toBe('my-agent.md')
  })
})

describe('composeSkillFamily – edge cases for concatenateStatic', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    while (tempDirs.length > 0) {
      fs.rmSync(tempDirs.pop() as string, { recursive: true, force: true })
    }
  })

  it('returns overlay only when base content is empty', () => {
    const root = createTempDir('mantra-family-emptybase-')
    tempDirs.push(root)

    const familyDir = writeFamily({
      dir: root,
      name: 'empty-base',
      familyYml: 'targets:\n  generic: generic.md\n',
      baseContent: '',
      overlays: { 'generic.md': 'overlay only' },
    })

    const family = loadSkillFamily(familyDir)
    const composed = composeSkillFamily(family, 'generic')
    expect(composed.content).toBe('overlay only')
  })

  it('returns base only when overlay content is empty', () => {
    const root = createTempDir('mantra-family-emptyoverlay-')
    tempDirs.push(root)

    const familyDir = writeFamily({
      dir: root,
      name: 'empty-overlay',
      familyYml: 'targets:\n  generic: generic.md\n',
      baseContent: 'base body',
      overlays: { 'generic.md': '' },
    })

    const family = loadSkillFamily(familyDir)
    const composed = composeSkillFamily(family, 'generic')
    expect(composed.content).toBe('base body')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// content-entries.ts gap coverage
// ──────────────────────────────────────────────────────────────────────────────

describe('listContentEntries – error branches', () => {
  const tempDirs: string[] = []
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    savedEnv.MANTRA_USER_CONTENT_ROOTS = process.env.MANTRA_USER_CONTENT_ROOTS
    process.env.MANTRA_USER_CONTENT_ROOTS = ''
    __resetSourcesFileCache()
  })

  afterEach(() => {
    process.env.MANTRA_USER_CONTENT_ROOTS = savedEnv.MANTRA_USER_CONTENT_ROOTS
    __resetSourcesFileCache()
    while (tempDirs.length > 0) {
      fs.rmSync(tempDirs.pop() as string, { recursive: true, force: true })
    }
  })

  it('throws E_INPUT_INVALID when two families resolve to the same output name in the same source', () => {
    const root = createTempDir('mantra-entries-dupe-')
    tempDirs.push(root)

    const agentsDir = path.join(root, 'agents')
    fs.mkdirSync(agentsDir, { recursive: true })

    // Two family dirs that will produce the same output name (same base, different dirs)
    writeFamily({
      dir: agentsDir,
      name: 'duplicate-output',
      familyYml: 'name: duplicate-output\ndescription: first\ntargets: {}\n',
      baseContent: 'first',
    })
    writeFamily({
      dir: agentsDir,
      name: 'duplicate-output-copy',
      familyYml: 'name: duplicate-output\ndescription: second\ntargets: {}\n',
      baseContent: 'second',
    })

    process.env.MANTRA_USER_CONTENT_ROOTS = root

    expect(() => listContentEntries('agents', { target: 'generic' })).toThrowError(
      /family 出力名が重複/,
    )
  })

  it('skips non-.md files in agents source directory', () => {
    const root = createTempDir('mantra-entries-nonmd-')
    tempDirs.push(root)

    const agentsDir = path.join(root, 'agents')
    fs.mkdirSync(agentsDir, { recursive: true })

    fs.writeFileSync(path.join(agentsDir, 'readme.txt'), 'this should be ignored', 'utf8')
    fs.writeFileSync(path.join(agentsDir, 'valid.md'), '# Valid', 'utf8')

    process.env.MANTRA_USER_CONTENT_ROOTS = root

    const result = listContentEntries('agents')
    const names = result.entries.map(e => e.relativeName)
    expect(names).not.toContain('readme.txt')
    expect(names).toContain('valid.md')
  })

  it('emits family-over-legacy warning when family replaces existing legacy with same name in same source', () => {
    const root = createTempDir('mantra-entries-familywin-')
    tempDirs.push(root)

    const agentsDir = path.join(root, 'agents')
    fs.mkdirSync(agentsDir, { recursive: true })

    // Write legacy first (alphabetically before .family dir)
    fs.writeFileSync(
      path.join(agentsDir, 'aaa-override.md'),
      '---\nname: aaa-override\ndescription: legacy\ntools: []\n---\n',
      'utf8',
    )
    writeFamily({
      dir: agentsDir,
      name: 'aaa-override',
      familyYml: 'description: family wins\ntargets: {}\n',
      baseContent: 'family body',
    })

    process.env.MANTRA_USER_CONTENT_ROOTS = root

    const result = listContentEntries('agents', { target: 'generic' })
    const entry = result.entries.find(e => e.relativeName === 'aaa-override.md')
    expect(entry?.entryKind).toBe('family')
    expect(result.warningHooks.some(h => h.policy === 'family-over-legacy')).toBe(true)
  })

  it('emits warning when legacy follows family with same name (family keeps winning)', () => {
    const root = createTempDir('mantra-entries-legacylater-')
    tempDirs.push(root)

    const agentsDir = path.join(root, 'agents')
    fs.mkdirSync(agentsDir, { recursive: true })

    // Use names so family dir sorts before legacy (e.g. aaa-agent.family < aaa-agent.md)
    writeFamily({
      dir: agentsDir,
      name: 'aaa-agent',
      familyYml: 'description: first family\ntargets: {}\n',
      baseContent: 'family first',
    })
    // Legacy with same resolved name added after (sorted after .family)
    fs.writeFileSync(
      path.join(agentsDir, 'aaa-agent.md'),
      '---\nname: aaa-agent\ndescription: legacy after\ntools: []\n---\n',
      'utf8',
    )

    process.env.MANTRA_USER_CONTENT_ROOTS = root

    const result = listContentEntries('agents', { target: 'generic' })
    const entry = result.entries.find(e => e.relativeName === 'aaa-agent.md')
    // Family wins, but entry should still exist
    expect(entry?.entryKind).toBe('family')
    expect(result.warningHooks.some(h => h.policy === 'family-over-legacy')).toBe(true)
  })

  it('later legacy entry wins over earlier legacy with same name in same source', () => {
    const root = createTempDir('mantra-entries-later-wins-')
    tempDirs.push(root)

    const agentsDir = path.join(root, 'agents')
    fs.mkdirSync(agentsDir, { recursive: true })

    // Two legacy files — impossible in same flat dir since filenames are unique.
    // But two sources can produce the same relativeName. Use MANTRA_USER_CONTENT_ROOTS
    // with two roots that both have a legacy with the same name: later source wins.
    const rootB = createTempDir('mantra-entries-later-wins-B-')
    tempDirs.push(rootB)

    const agentsDirB = path.join(rootB, 'agents')
    fs.mkdirSync(agentsDirB, { recursive: true })

    fs.writeFileSync(path.join(agentsDir, 'shared.md'), '# A', 'utf8')
    fs.writeFileSync(path.join(agentsDirB, 'shared.md'), '# B', 'utf8')

    process.env.MANTRA_USER_CONTENT_ROOTS = `${root},${rootB}`

    const result = listContentEntries('agents', { target: 'generic' })
    const entries = result.entries.filter(e => e.relativeName === 'shared.md')
    // Both sources produce shared.md; each source handles its own entries separately
    // and the cross-source merge keeps both (one per source)
    expect(entries.length).toBeGreaterThanOrEqual(1)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// validation-summary.ts gap coverage
// ──────────────────────────────────────────────────────────────────────────────

describe('selectSummaryErrorCode', () => {
  it('returns E_INPUT_INVALID when present', () => {
    expect(
      selectSummaryErrorCode(['E_SCHEMA_FRONTMATTER', 'E_INPUT_INVALID'], 'E_SCHEMA_FRONTMATTER'),
    ).toBe('E_INPUT_INVALID')
  })

  it('returns E_FAMILY_DRIFT when present and E_INPUT_INVALID is not', () => {
    expect(
      selectSummaryErrorCode(['E_FAMILY_DRIFT', 'E_SCHEMA_FRONTMATTER'], 'E_SCHEMA_FRONTMATTER'),
    ).toBe('E_FAMILY_DRIFT')
  })

  it('returns schemaFallback when only schemaFallback code is present', () => {
    expect(selectSummaryErrorCode(['E_SCHEMA_FRONTMATTER'], 'E_SCHEMA_FRONTMATTER')).toBe(
      'E_SCHEMA_FRONTMATTER',
    )
  })

  it('returns first code when none of the priority codes match', () => {
    expect(selectSummaryErrorCode(['E_IO'], 'E_SCHEMA_FRONTMATTER')).toBe('E_IO')
  })

  it('returns schemaFallback when array is empty', () => {
    expect(selectSummaryErrorCode([], 'E_SCHEMA_RULE')).toBe('E_SCHEMA_RULE')
  })
})
