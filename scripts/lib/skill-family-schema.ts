import { z } from 'zod'

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
    targets: SkillFamilyTargetsSchema.optional().default({}),
  })
  .strict()

export type SkillFamilyFile = z.infer<typeof SkillFamilyFileSchema>
