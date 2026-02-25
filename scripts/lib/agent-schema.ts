import { z } from 'zod'

export const SAFE_NAME_RE = /^[a-zA-Z0-9_-]+$/

export const ClaudeAgentFrontmatter = z.object({
  name: z
    .string()
    .regex(SAFE_NAME_RE, 'name には英数字・ハイフン・アンダースコアのみ使用できます'),
  description: z.string(),
  tools: z.array(z.string()).optional().default([]),
  model: z.string().optional(),
})

export type ClaudeAgentFrontmatter = z.infer<typeof ClaudeAgentFrontmatter>
