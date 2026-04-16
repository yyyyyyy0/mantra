import * as os from 'node:os'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CliError,
  ensureNodeVersion,
  hasJsonFlag,
  metricsDirectoryPath,
  toCliError,
} from '../scripts/lib/cli-telemetry'

describe('CliError', () => {
  it('stores message, code, and default retryable=false', () => {
    const err = new CliError('boom', 'E_IO')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('CliError')
    expect(err.message).toBe('boom')
    expect(err.code).toBe('E_IO')
    expect(err.retryable).toBe(false)
  })

  it('honors retryable when provided', () => {
    const err = new CliError('transient', 'E_INTERNAL', true)
    expect(err.retryable).toBe(true)
  })
})

describe('hasJsonFlag', () => {
  it('returns true when --json is present', () => {
    expect(hasJsonFlag(['node', 'cli.js', '--json'])).toBe(true)
  })

  it('returns false when --json is absent', () => {
    expect(hasJsonFlag(['node', 'cli.js', '--verbose'])).toBe(false)
  })

  it('returns true when --json is mixed with other flags', () => {
    expect(hasJsonFlag(['node', 'cli.js', '--verbose', '--json', '--dry-run'])).toBe(true)
  })

  it('does not match substrings like --json=1', () => {
    expect(hasJsonFlag(['node', 'cli.js', '--json=1'])).toBe(false)
  })

  it('defaults to process.argv when argv is omitted', () => {
    expect(typeof hasJsonFlag()).toBe('boolean')
  })
})

describe('toCliError', () => {
  it('returns the same CliError instance when given one', () => {
    const original = new CliError('already cli', 'E_INPUT_INVALID')
    const result = toCliError(original)
    expect(result).toBe(original)
  })

  it('maps EACCES to E_FS_PERMISSION', () => {
    const err = new Error('EACCES: permission denied, open /etc/passwd')
    const result = toCliError(err)
    expect(result).toBeInstanceOf(CliError)
    expect(result.code).toBe('E_FS_PERMISSION')
    expect(result.retryable).toBe(false)
    expect(result.message).toBe('EACCES: permission denied, open /etc/passwd')
  })

  it('maps EPERM to E_FS_PERMISSION', () => {
    const err = new Error('EPERM: operation not permitted')
    const result = toCliError(err)
    expect(result.code).toBe('E_FS_PERMISSION')
  })

  it('maps ENOENT to E_IO', () => {
    const err = new Error('ENOENT: no such file or directory')
    const result = toCliError(err)
    expect(result.code).toBe('E_IO')
  })

  it('maps EISDIR to E_IO', () => {
    const err = new Error('EISDIR: illegal operation on a directory')
    const result = toCliError(err)
    expect(result.code).toBe('E_IO')
  })

  it('falls back to E_INTERNAL by default for unknown errors', () => {
    const err = new Error('something unexpected')
    const result = toCliError(err)
    expect(result.code).toBe('E_INTERNAL')
    expect(result.message).toBe('something unexpected')
  })

  it('uses the provided fallback code for unknown errors', () => {
    const err = new Error('schema invalid')
    const result = toCliError(err, 'E_SCHEMA_RULE')
    expect(result.code).toBe('E_SCHEMA_RULE')
  })

  it('coerces non-Error values to string', () => {
    const result = toCliError('raw string failure')
    expect(result).toBeInstanceOf(CliError)
    expect(result.message).toBe('raw string failure')
    expect(result.code).toBe('E_INTERNAL')
  })

  it('coerces non-string, non-Error values to string', () => {
    const result = toCliError(42)
    expect(result.message).toBe('42')
  })
})

describe('ensureNodeVersion', () => {
  it('passes when current Node major is >= minMajor', () => {
    const currentMajor = Number(process.versions.node.split('.')[0])
    expect(() => ensureNodeVersion(currentMajor)).not.toThrow()
    expect(() => ensureNodeVersion(1)).not.toThrow()
  })

  it('throws CliError with E_ENV_NODE_VERSION when current is below minMajor', () => {
    const currentMajor = Number(process.versions.node.split('.')[0])
    const future = currentMajor + 100

    let caught: unknown
    try {
      ensureNodeVersion(future)
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(CliError)
    const cli = caught as CliError
    expect(cli.code).toBe('E_ENV_NODE_VERSION')
    expect(cli.retryable).toBe(false)
    expect(cli.message).toContain(`v${future}+`)
    expect(cli.message).toContain(process.versions.node)
  })
})

describe('metricsDirectoryPath', () => {
  it('defaults to os.homedir()/.mantra/metrics', () => {
    expect(metricsDirectoryPath()).toBe(path.join(os.homedir(), '.mantra', 'metrics'))
  })

  it('honors a custom home directory', () => {
    const custom = path.join(path.sep, 'tmp', 'custom-home')
    expect(metricsDirectoryPath(custom)).toBe(path.join(custom, '.mantra', 'metrics'))
  })
})
