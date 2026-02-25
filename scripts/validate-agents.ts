import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import { ClaudeAgentFrontmatter } from './lib/agent-schema'

function main(): void {
  const agentsDir = path.join(process.cwd(), 'agents')
  const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'))

  let errors = 0

  for (const file of files) {
    const filePath = path.join(agentsDir, file)
    const content = fs.readFileSync(filePath, 'utf8')

    try {
      // Parse and validate
      const lines = content.split('\n')
      const startIndex = lines.indexOf('---')
      const endIndex = lines.indexOf('---', 1)

      if (startIndex !== 0 || endIndex === -1) {
        throw new Error('Invalid frontmatter format')
      }

      const rawYaml = lines.slice(1, endIndex).join('\n')
      const parsed = yaml.load(rawYaml, { schema: yaml.DEFAULT_SCHEMA })
      ClaudeAgentFrontmatter.parse(parsed)
    } catch (err) {
      console.error(`✗ ${file}: ${err instanceof Error ? err.message : String(err)}`)
      errors++
    }
  }

  if (errors > 0) {
    console.error(`\n${errors} 件のエラーが見つかりました`)
    process.exit(1)
  }

  console.log(`✓ ${files.length} 件のエージェント定義が有効です`)
}

main()
