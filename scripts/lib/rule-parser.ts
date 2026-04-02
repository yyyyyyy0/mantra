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

const RULE_TRIGGER_MAP: Record<string, string> = {
  'coding-style': 'Apply coding style rules (immutability, file organization, error handling) when writing or reviewing code',
  'git-workflow': 'Apply git workflow rules (commit messages, PR workflow, branching) when committing or creating PRs',
  testing: 'Apply testing rules (TDD, coverage thresholds, test isolation) when writing or reviewing tests',
  performance: 'Apply performance rules (model selection, context management) when optimizing or planning',
  patterns: 'Apply common code patterns (API responses, hooks, repositories) when implementing features',
  hooks: 'Apply hooks rules (PreToolUse, PostToolUse, Stop guards) when configuring or reviewing hooks',
  agents: 'Apply agent orchestration rules (mob programming, escalation, parallel execution) when coordinating agents',
  security: 'Apply security rules (secrets, input validation, OWASP) when writing or reviewing security-sensitive code',
  'pr-automation': 'Apply PR automation rules (risk classification, auto-merge, AI review) when configuring CI/CD',
  'mob-programming': 'Apply mob programming rules (flash-mob, plan-mob, review-mob) when running multi-agent collaboration',
  'failure-modes': 'Apply named failure mode prohibitions (verification shortcuts, scope creep, test manipulation) to prevent known LLM failure patterns',
}

export function buildRuleDescription(name: string, content: string): string {
  const h1 = extractH1(content)
  if (h1) {
    return `Apply ${h1.toLowerCase()} rules when relevant to the current task`
  }
  return RULE_TRIGGER_MAP[name] ?? `Apply ${humanizeName(name).toLowerCase()} rules when relevant to the current task`
}

export function parseRuleFile(content: string, filename: string): ParsedRule {
  const name = filename.replace(/\.md$/, '')
  const description = buildRuleDescription(name, content)
  const metadata = RuleMetadata.parse({ name, description })

  return { metadata, body: content }
}
