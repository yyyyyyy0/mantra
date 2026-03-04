import { z } from 'zod'
import { SAFE_NAME_RE } from './agent-schema'

export const SkillFamilyTargetSchema = z.enum(['claude', 'codex', 'generic'])

export type SkillFamilyTarget = z.infer<typeof SkillFamilyTargetSchema>

export const SkillFamilyTargetsSchema = z
  .object({
    claude: z.string().min(1).optional(),
    codex: z.string().min(1).optional(),
    generic: z.string().min(1).optional(),
  })
  .strict()

export const SkillFamilyDriftGuardSchema = z
  .object({
    enabled: z.boolean().optional().default(false),
    max_overlay_ratio: z.number().positive().max(1).optional(),
  })
  .strict()

export type SkillFamilyDriftGuard = z.infer<typeof SkillFamilyDriftGuardSchema>

export const SkillFamilyFileSchema = z
  .object({
    name: z.string().regex(SAFE_NAME_RE).optional(),
    description: z.string().min(1).optional(),
    tools: z.array(z.string()).optional(),
    model: z.string().optional(),
    targets: SkillFamilyTargetsSchema.optional().default({}),
    drift_guard: SkillFamilyDriftGuardSchema.optional(),
  })
  .strict()

export type SkillFamilyFile = z.infer<typeof SkillFamilyFileSchema>
