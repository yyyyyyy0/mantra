import * as fs from 'fs'
import * as path from 'path'
import { RULES_DIR } from './lib/project-paths'
import { parseRuleFile } from './lib/rule-parser'

function main(): void {
  const files = fs.readdirSync(RULES_DIR).filter(f => f.endsWith('.md'))

  let errors = 0

  for (const file of files) {
    const filePath = path.join(RULES_DIR, file)
    const content = fs.readFileSync(filePath, 'utf8')

    try {
      parseRuleFile(content, file)
    } catch (err) {
      console.error(`✗ ${file}: ${err instanceof Error ? err.message : String(err)}`)
      errors++
    }
  }

  if (errors > 0) {
    console.error(`\n${errors} 件のエラーが見つかりました`)
    process.exit(1)
  }

  console.log(`✓ ${files.length} 件のルール定義が有効です`)
}

main()
