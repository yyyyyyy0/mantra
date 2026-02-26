import { describe, it, expect } from 'vitest'
import { ClaudeAgentFrontmatter } from '../scripts/lib/agent-schema'
import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'

describe('Agent Definitions', () => {
  const agentsDir = path.join(process.cwd(), 'agents')
  const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'))

  it.each(files.map(f => ({ name: f, path: path.join(agentsDir, f) })))(
    '$name should have valid frontmatter schema',
    ({ path: filePath, name }) => {
      const content = fs.readFileSync(filePath, 'utf8')
      const lines = content.split('\n')

      // Extract YAML frontmatter
      const startIndex = lines.indexOf('---')
      const endIndex = lines.indexOf('---', 1)

      expect(startIndex).toBe(0)
      expect(endIndex).toBeGreaterThan(0)

      const rawYaml = lines.slice(1, endIndex).join('\n')
      const parsed = yaml.load(rawYaml, { schema: yaml.DEFAULT_SCHEMA })

      // Validate against Zod schema
      const result = ClaudeAgentFrontmatter.safeParse(parsed)

      if (!result.success) {
        const formatted = result.error.issues.map(e => {
          return `  - ${e.path.join('.')}: ${e.message}`
        }).join('\n')
        throw new Error(`Schema validation failed for ${name}:\n${formatted}`)
      }

      expect(result.success).toBe(true)
    }
  )

  it('all agents should have unique names', () => {
    const names = files.map(f => {
      const content = fs.readFileSync(path.join(agentsDir, f), 'utf8')
      const match = content.match(/^name: (.+)$/m)
      return match ? match[1].trim() : null
    }).filter(Boolean)

    const unique = new Set(names)
    expect(unique.size).toBe(names.length)
  })
})
