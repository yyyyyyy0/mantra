import { composeSkillFamily, type LoadedSkillFamily } from './skill-family'
import type { SkillFamilyTarget } from './skill-family-schema'

const GENERATED_TARGETS: SkillFamilyTarget[] = ['claude', 'codex', 'generic']
const LOCK_MARKER_RE = /<!--\s*mantra-lock:([a-zA-Z0-9_-]+):(start|end)\s*-->/g

export type DriftViolationCode =
  | 'LOCK_MARKER_PARSE'
  | 'LOCK_MARKER_MISMATCH'
  | 'LOCK_MARKER_CONFLICT'
  | 'OVERLAY_RATIO_EXCEEDED'

export interface DriftViolation {
  code: DriftViolationCode
  message: string
  target?: SkillFamilyTarget
  details?: Record<string, unknown>
}

export interface SkillFamilyDriftCheckResult {
  enabled: boolean
  checkedTargets: SkillFamilyTarget[]
  maxOverlayRatio: number
  baseNonEmptyLines: number
  violations: DriftViolation[]
}

interface ParsedLockBlocks {
  blocks: Map<string, string>
  errors: string[]
}

interface OpenLockMarker {
  id: string
  startIndex: number
}

function parseLockBlocks(content: string): ParsedLockBlocks {
  const blocks = new Map<string, string>()
  const errors: string[] = []
  let open: OpenLockMarker | undefined

  LOCK_MARKER_RE.lastIndex = 0
  let match = LOCK_MARKER_RE.exec(content)
  while (match !== null) {
    const full = match[0]
    const id = match[1] ?? ''
    const markerType = match[2]
    const markerStart = match.index

    if (markerType === 'start') {
      if (open !== undefined) {
        errors.push(`nested marker is not allowed: start(${id}) while ${open.id} is open`)
      }
      open = {
        id,
        startIndex: markerStart,
      }
      match = LOCK_MARKER_RE.exec(content)
      continue
    }

    if (open === undefined) {
      errors.push(`end marker without start: ${id}`)
      match = LOCK_MARKER_RE.exec(content)
      continue
    }

    if (open.id !== id) {
      errors.push(`marker id mismatch: expected ${open.id}, got ${id}`)
      open = undefined
      match = LOCK_MARKER_RE.exec(content)
      continue
    }

    if (blocks.has(id)) {
      errors.push(`duplicate lock marker id: ${id}`)
    } else {
      blocks.set(id, content.slice(open.startIndex, markerStart + full.length))
    }
    open = undefined
    match = LOCK_MARKER_RE.exec(content)
  }

  if (open !== undefined) {
    errors.push(`start marker without end: ${open.id}`)
  }

  return {
    blocks,
    errors,
  }
}

function countNonEmptyLines(content: string): number {
  return content
    .split('\n')
    .filter(line => line.trim().length > 0)
    .length
}

function overlayContentForTarget(family: LoadedSkillFamily, target: SkillFamilyTarget): string {
  const composed = composeSkillFamily(family, target)
  if (composed.overlayTarget === undefined) {
    return ''
  }

  return family.overlays[composed.overlayTarget]?.content ?? ''
}

function checkOverlayRatio(
  family: LoadedSkillFamily,
  target: SkillFamilyTarget,
  baseNonEmptyLines: number,
): DriftViolation | undefined {
  const overlay = overlayContentForTarget(family, target)
  const overlayNonEmptyLines = countNonEmptyLines(overlay)
  const denominator = baseNonEmptyLines === 0 ? 1 : baseNonEmptyLines
  const ratio = overlayNonEmptyLines / denominator

  if (ratio <= family.driftGuard.maxOverlayRatio) {
    return undefined
  }

  return {
    code: 'OVERLAY_RATIO_EXCEEDED',
    target,
    message: `overlay ratio exceeded for ${target}: ${ratio.toFixed(3)} > ${family.driftGuard.maxOverlayRatio.toFixed(3)}`,
    details: {
      target,
      ratio,
      max_overlay_ratio: family.driftGuard.maxOverlayRatio,
      overlay_non_empty_lines: overlayNonEmptyLines,
      base_non_empty_lines: baseNonEmptyLines,
    },
  }
}

function checkLockContracts(
  family: LoadedSkillFamily,
  target: SkillFamilyTarget,
  baseLocks: ParsedLockBlocks,
): DriftViolation[] {
  const violations: DriftViolation[] = []
  const composed = composeSkillFamily(family, target)
  const generatedLocks = parseLockBlocks(composed.content)

  for (const error of generatedLocks.errors) {
    violations.push({
      code: 'LOCK_MARKER_PARSE',
      target,
      message: `invalid lock marker structure in generated ${target}: ${error}`,
      details: {
        target,
        error,
      },
    })
  }

  for (const [id, baseBlock] of baseLocks.blocks.entries()) {
    const generatedBlock = generatedLocks.blocks.get(id)
    if (generatedBlock === undefined) {
      violations.push({
        code: 'LOCK_MARKER_MISMATCH',
        target,
        message: `lock marker ${id} is missing in generated ${target}`,
        details: {
          target,
          marker_id: id,
        },
      })
      continue
    }

    if (generatedBlock !== baseBlock) {
      violations.push({
        code: 'LOCK_MARKER_MISMATCH',
        target,
        message: `lock marker ${id} changed in generated ${target}`,
        details: {
          target,
          marker_id: id,
        },
      })
    }
  }

  for (const generatedId of generatedLocks.blocks.keys()) {
    if (!baseLocks.blocks.has(generatedId)) {
      violations.push({
        code: 'LOCK_MARKER_CONFLICT',
        target,
        message: `generated ${target} contains lock marker ${generatedId} not present in base`,
        details: {
          target,
          marker_id: generatedId,
        },
      })
    }
  }

  return violations
}

export function validateSkillFamilyDrift(
  family: LoadedSkillFamily,
): SkillFamilyDriftCheckResult {
  if (!family.driftGuard.enabled) {
    return {
      enabled: false,
      checkedTargets: [],
      maxOverlayRatio: family.driftGuard.maxOverlayRatio,
      baseNonEmptyLines: countNonEmptyLines(family.baseContent),
      violations: [],
    }
  }

  const violations: DriftViolation[] = []
  const baseNonEmptyLines = countNonEmptyLines(family.baseContent)
  const baseLocks = parseLockBlocks(family.baseContent)

  for (const error of baseLocks.errors) {
    violations.push({
      code: 'LOCK_MARKER_PARSE',
      message: `invalid lock marker structure in base: ${error}`,
      details: {
        error,
      },
    })
  }

  for (const target of GENERATED_TARGETS) {
    const ratioViolation = checkOverlayRatio(family, target, baseNonEmptyLines)
    if (ratioViolation !== undefined) {
      violations.push(ratioViolation)
    }

    violations.push(...checkLockContracts(family, target, baseLocks))
  }

  return {
    enabled: true,
    checkedTargets: [...GENERATED_TARGETS],
    maxOverlayRatio: family.driftGuard.maxOverlayRatio,
    baseNonEmptyLines,
    violations,
  }
}
