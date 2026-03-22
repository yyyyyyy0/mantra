import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { extractH1, humanizeName, parseRuleFile } from '../scripts/lib/rule-parser'

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

  it('humanizeName converts kebab-case names into title case', () => {
    expect(humanizeName('security-reviewer')).toBe('Security Reviewer')
    expect(humanizeName('tdd-guide')).toBe('Tdd Guide')
  })

  it('extractH1 ignores fenced code blocks and returns first top-level heading', () => {
    const content = [
      '```md',
      '# Fake heading in code fence',
      '```',
      '',
      '# Real Heading',
      'Body',
    ].join('\n')

    expect(extractH1(content)).toBe('Real Heading')
  })

  it('parseRuleFile falls back to humanized filename when H1 is missing', () => {
    const content = 'No H1 here.\n\nbody only.'
    const parsed = parseRuleFile(content, 'sample-rule.md')

    expect(parsed.metadata.name).toBe('sample-rule')
    expect(parsed.metadata.description).toBe('Apply sample rule rules when relevant to the current task')
  })
})
