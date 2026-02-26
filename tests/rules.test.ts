import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { parseRuleFile } from '../scripts/lib/rule-parser'

describe('Rule Definitions', () => {
  const rulesDir = path.join(process.cwd(), 'rules')
  const files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.md'))

  it.each(files.map(f => ({ name: f, path: path.join(rulesDir, f) })))(
    '$name should have valid metadata schema',
    ({ path: filePath, name }) => {
      const content = fs.readFileSync(filePath, 'utf8')
      const { metadata } = parseRuleFile(content, name)

      expect(metadata.name).toBe(name.replace(/\.md$/, ''))
      expect(metadata.description.length).toBeGreaterThan(0)
    },
  )

  it('all rules should have unique names', () => {
    const names = files.map(file => {
      const content = fs.readFileSync(path.join(rulesDir, file), 'utf8')
      return parseRuleFile(content, file).metadata.name
    })

    const unique = new Set(names)
    expect(unique.size).toBe(names.length)
  })
})
