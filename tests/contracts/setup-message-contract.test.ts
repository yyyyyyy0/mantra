import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getSetupSuccessOutputLines,
  writeSetupSuccessOutput,
} from '../../scripts/lib/setup-orchestrator'

describe('Setup success message contract', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps setup success output split into core and optional next steps', () => {
    expect(getSetupSuccessOutputLines()).toEqual([
      'セットアップが完了しました。',
      'Core next step: npm run validate',
      'Optional next step: npm run sync:codex',
    ])

    const writes: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown): boolean => {
      writes.push(String(chunk))
      return true
    })

    writeSetupSuccessOutput(false)

    const output = writes.join('')
    expect(output).toContain('セットアップが完了しました。')
    expect(output).toContain('Core next step: npm run validate')
    expect(output).toContain('Optional next step: npm run sync:codex')
    expect(output).not.toContain('次のステップ: npm run sync:codex')
  })

  it('does not emit success text in json mode', () => {
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)

    writeSetupSuccessOutput(true)

    expect(stdoutSpy).not.toHaveBeenCalled()
  })
})
