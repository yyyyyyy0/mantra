import { RuleMetadata } from './rule-schema'

type RuleMetadataType = typeof RuleMetadata._output

export interface ParsedRule {
  metadata: RuleMetadataType
  body: string
}

export function humanizeName(name: string): string {
  return name
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

export function extractH1(content: string): string | undefined {
  let insideCodeBlock = false
  for (const line of content.split('\n')) {
    if (line.startsWith('```')) {
      insideCodeBlock = !insideCodeBlock
      continue
    }
    if (!insideCodeBlock && /^# .+/.test(line)) {
      return line.replace(/^# /, '').trim()
    }
  }
  return undefined
}

export function parseRuleFile(content: string, filename: string): ParsedRule {
  const name = filename.replace(/\.md$/, '')
  const description = extractH1(content) ?? humanizeName(name)
  const metadata = RuleMetadata.parse({ name, description })

  return { metadata, body: content }
}
