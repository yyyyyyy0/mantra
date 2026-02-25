import { z } from 'zod'

export const SAFE_NAME_RE = /^[a-zA-Z0-9_-]+$/

export const RuleMetadata = z.object({
  name: z
    .string()
    .regex(SAFE_NAME_RE, 'name には英数字・ハイフン・アンダースコアのみ使用できます'),
  description: z.string().min(1, 'description は空にできません'),
})

export type RuleMetadata = z.infer<typeof RuleMetadata>
