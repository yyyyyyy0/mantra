import { execFileSync } from 'node:child_process'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'

const HOOK = path.resolve(__dirname, '..', '..', 'hooks', 'p-judge.sh')

interface HookOutput {
  hookSpecificOutput?: {
    hookEventName?: string
    additionalContext?: string
  }
}

function runHook(inputJson: string): { stdout: string; parsed: HookOutput | null } {
  const stdout = execFileSync('bash', [HOOK], {
    input: inputJson,
    encoding: 'utf8',
  }).trim()
  const parsed = stdout.length > 0 ? (JSON.parse(stdout) as HookOutput) : null
  return { stdout, parsed }
}

function contextOf(inputJson: string): string {
  const { parsed } = runHook(inputJson)
  expect(parsed?.hookSpecificOutput?.hookEventName).toBe('UserPromptSubmit')
  return parsed?.hookSpecificOutput?.additionalContext ?? ''
}

describe('p-judge hook contract (P0-P4 injection)', () => {
  it('P0: 静音 — 軽微な docs-only 編集では何も注入しない', () => {
    const { stdout } = runHook(JSON.stringify({ prompt: 'READMEのタイポ直して' }))
    expect(stdout).toBe('')
  })

  it('P1: 実装/複数ファイルで planner 起動を注入する', () => {
    const ctx = contextOf(JSON.stringify({ prompt: 'ユーザー一覧画面を実装して。複数ファイルにまたがる' }))
    expect(ctx).toContain('[mantra] P判定')
    expect(ctx).toContain('P1')
    expect(ctx).toContain('planner')
  })

  it('P3: 認証/課金/マイグレーション等の高リスクで mob-critic + security-reviewer を必須注入する', () => {
    const ctx = contextOf(JSON.stringify({ prompt: 'ログイン認証まわりのトークン検証を修正して' }))
    expect(ctx).toContain('P3')
    expect(ctx).toContain('security-reviewer')
    expect(ctx).toContain('mob-critic')
  })

  it('P4: 非自明なコード変更で code-reviewer を注入する', () => {
    const ctx = contextOf(JSON.stringify({ prompt: 'この関数のバグ修正して' }))
    expect(ctx).toContain('P4')
    expect(ctx).toContain('code-reviewer')
  })

  it('.message フィールドでも .prompt と同様に判定する（後方互換）', () => {
    const ctx = contextOf(JSON.stringify({ message: '決済のマイグレーションを実装' }))
    expect(ctx).toContain('P3')
    expect(ctx).toContain('P1')
  })

  it('空入力・空プロンプトでも壊れず静音で通す', () => {
    expect(runHook('').stdout).toBe('')
    expect(runHook(JSON.stringify({ prompt: '' })).stdout).toBe('')
    expect(runHook('not-json-at-all').stdout).toBe('')
  })
})
