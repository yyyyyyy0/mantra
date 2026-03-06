import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import { composeSkillFamily, loadSkillFamily } from '../../scripts/lib/skill-family'

function loadAutonomousImprovementLoopFamily() {
  return loadSkillFamily(
    path.join(process.cwd(), 'agents', 'autonomous-improvement-loop.family'),
    { kind: 'agents' },
  )
}

function expectLockedContractSections(content: string): void {
  expect(content).toContain('<!-- mantra-lock:ail-core-mode:start -->')
  expect(content).toContain('<!-- mantra-lock:ail-core-mode:end -->')
  expect(content).toContain('<!-- mantra-lock:ail-qa-only:start -->')
  expect(content).toContain('<!-- mantra-lock:ail-qa-only:end -->')
  expect(content).toContain('<!-- mantra-lock:ail-round-summary:start -->')
  expect(content).toContain('<!-- mantra-lock:ail-round-summary:end -->')
  expect(content).toContain('<!-- mantra-lock:ail-final-handoff:start -->')
  expect(content).toContain('<!-- mantra-lock:ail-final-handoff:end -->')
  expect(content).toContain('`[AIL][rNN]`')
  expect(content).toContain('`selected_issue:`')
  expect(content).toContain('`stop_reason`')
  expect(content).toContain('`recommended_escalation`')
}

describe('autonomous-improvement-loop family contract', () => {
  it('keeps the locked round summary and final handoff contract across all targets', () => {
    const family = loadAutonomousImprovementLoopFamily()

    for (const target of ['claude', 'codex', 'generic'] as const) {
      const composed = composeSkillFamily(family, target)
      expectLockedContractSections(composed.content)
    }
  })

  it('keeps target-specific overlays thin and isolated', () => {
    const family = loadAutonomousImprovementLoopFamily()
    const claude = composeSkillFamily(family, 'claude')
    const codex = composeSkillFamily(family, 'codex')
    const generic = composeSkillFamily(family, 'generic')

    expect(claude.overlayTarget).toBe('claude')
    expect(claude.content).toContain('## Claude-style Reporting')
    expect(claude.content).toContain('## Claude-style Round Narrative')
    expect(claude.content).not.toContain('## Codex-style Reporting')
    expect(claude.content).not.toContain('## Generic Reporting')

    expect(codex.overlayTarget).toBe('codex')
    expect(codex.content).toContain('## Codex-style Reporting')
    expect(codex.content).toContain('## Codex-style Final Handoff')
    expect(codex.content).not.toContain('## Claude-style Reporting')
    expect(codex.content).not.toContain('## Generic Reporting')

    expect(generic.overlayTarget).toBe('generic')
    expect(generic.content).toContain('## Generic Reporting')
    expect(generic.content).not.toContain('## Claude-style Reporting')
    expect(generic.content).not.toContain('## Codex-style Reporting')
  })
})
