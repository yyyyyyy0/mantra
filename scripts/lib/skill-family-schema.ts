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

export const SkillFamilyFileSchema = z
  .object({
    name: z.string().regex(SAFE_NAME_RE).optional(),
    description: z.string().min(1).optional(),
    tools: z.array(z.string()).optional(),
    model: z.string().optional(),
    targets: SkillFamilyTargetsSchema.optional().default({}),
  })
  .strict()

export type SkillFamilyFile = z.infer<typeof SkillFamilyFileSchema>
