import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildBackupPath, createSymlink, prepareDestination } from '../scripts/lib/setup-fs'

function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

describe('setup-fs helpers', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    while (tempDirs.length > 0) {
      fs.rmSync(tempDirs.pop() as string, { recursive: true, force: true })
    }
  })

  it('returns early when destination does not exist', () => {
    const tempDir = createTempDir('mantra-setup-fs-')
    tempDirs.push(tempDir)

    const target = path.join(tempDir, 'missing')

    expect(() => {
      prepareDestination(target, '~/.claude/agents', false, false)
    }).not.toThrow()
  })

  it('throws when destination exists and --force is not used', () => {
    const tempDir = createTempDir('mantra-setup-fs-')
    tempDirs.push(tempDir)

    const target = path.join(tempDir, 'existing')
    fs.mkdirSync(target, { recursive: true })

    expect(() => {
      prepareDestination(target, '~/.claude/rules', false, false)
    }).toThrow('上書きするには --force を使用してください')
  })

  it('removes an existing destination symlink when force is used', () => {
    const tempDir = createTempDir('mantra-setup-fs-')
    tempDirs.push(tempDir)

    const source = path.join(tempDir, 'source')
    const target = path.join(tempDir, 'dest')
    fs.mkdirSync(source, { recursive: true })
    fs.symlinkSync(source, target)

    expect(fs.lstatSync(target).isSymbolicLink()).toBe(true)
    prepareDestination(target, '~/.claude/rules', true, false)
    expect(fs.existsSync(target)).toBe(false)
  })

  it('renames an existing destination directory/file to backup when force is used', () => {
    const tempDir = createTempDir('mantra-setup-fs-')
    tempDirs.push(tempDir)

    const target = path.join(tempDir, 'legacy')
    const parent = path.dirname(target)
    fs.writeFileSync(target, 'legacy-data')

    prepareDestination(target, '~/.claude/rules', true, false)

    const backups = fs
      .readdirSync(parent)
      .filter(name => name.startsWith(`${path.basename(target)}.bak-`))

    expect(backups.length).toBeGreaterThan(0)
    expect(fs.existsSync(path.join(parent, backups[0]))).toBe(true)
    expect(fs.existsSync(target)).toBe(false)
  })

  it('builds sequential backup paths when a backup path already exists', () => {
    const tempDir = createTempDir('mantra-setup-fs-')
    tempDirs.push(tempDir)

    const target = path.join(tempDir, 'same')
    const now = new Date('2026-01-02T03:04:05.000Z')
    const first = buildBackupPath(target, now)
    fs.writeFileSync(first, 'seed')

    const expectedSecond = `${first}-2`
    expect(buildBackupPath(target, now)).toBe(expectedSecond)

    fs.writeFileSync(expectedSecond, 'seed2')
    const expectedThird = `${first}-3`
    expect(buildBackupPath(target, now)).toBe(expectedThird)
  })

  it('returns failure payload when symlink source is missing', () => {
    const tempDir = createTempDir('mantra-setup-fs-')
    tempDirs.push(tempDir)

  const source = path.join(tempDir, 'nope')
  const target = path.join(tempDir, 'missing')

  const result = createSymlink({ src: source, dest: target, label: 'missing-source' }, false, true)

  if (result.success === true) {
    throw new Error('Expected symlink creation to fail when source is missing.')
  }

  expect(result.errorCode).toBe('E_INPUT_INVALID')
  expect(result.message).toContain('ソースディレクトリが存在しません')
})
})
