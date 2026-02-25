import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as yaml from 'js-yaml'
import { buildSkillContent, CodexFrontmatter } from './lib/codex-utils'
import { writeAtomic } from './lib/fs-utils'
import { RuleMetadata } from './lib/rule-schema'

type RuleMetadata = typeof RuleMetadata._output

// ────────────────────────────────────────────────────────────
// カテゴリマッピング
// ────────────────────────────────────────────────────────────

const CATEGORY_MAP: Record<string, string> = {
  'coding-style': 'style',
  'git-workflow': 'workflow',
  testing: 'testing',
  performance: 'performance',
  patterns: 'patterns',
  hooks: 'tooling',
  agents: 'orchestration',
  security: 'security',
}

function inferCategory(name: string): string {
  return CATEGORY_MAP[name] ?? 'development'
}

function humanizeName(name: string): string {
  return name
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

// ────────────────────────────────────────────────────────────
// パーサー
// ────────────────────────────────────────────────────────────

interface ParsedRule {
  metadata: RuleMetadata
  body: string
}

function extractH1(content: string): string | undefined {
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

function parseRuleFile(content: string, filename: string): ParsedRule {
  const name = filename.replace(/\.md$/, '')
  const description = extractH1(content) ?? humanizeName(name)
  const metadata = RuleMetadata.parse({ name, description })

  return { metadata, body: content }
}

// ────────────────────────────────────────────────────────────
// 変換
// ────────────────────────────────────────────────────────────

function convertToCodexFrontmatter(src: RuleMetadata): CodexFrontmatter {
  return {
    name: src.name,
    description: src.description,
    license: 'Apache-2.0',
    compatibility: 'Works with any codebase',
    metadata: {
      author: 'mantra-project',
      version: '1.0.0',
      category: inferCategory(src.name),
      tags: ['claude-code', src.name],
    },
  }
}


// ────────────────────────────────────────────────────────────
// メイン
// ────────────────────────────────────────────────────────────

function main(): void {
  const rulesDir = path.join(__dirname, '..', 'rules')
  const outputBase = path.join(os.homedir(), '.codex', 'skills', 'mantra-rules')

  const files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.md'))
  if (files.length === 0) {
    throw new Error(`rules ディレクトリに Markdown ファイルが見つかりません: ${rulesDir}`)
  }

  type Result =
    | { success: true; name: string; dest: string }
    | { success: false; file: string; message: string }

  const results: Result[] = files.map(file => {
    const srcPath = path.join(rulesDir, file)
    try {
      const content = fs.readFileSync(srcPath, 'utf8')
      const { metadata, body } = parseRuleFile(content, file)
      const codexFm = convertToCodexFrontmatter(metadata)
      const skillContent = buildSkillContent(codexFm, body)

      const destPath = path.join(outputBase, metadata.name, 'SKILL.md')
      writeAtomic(destPath, skillContent, outputBase)

      process.stdout.write(`✓ ${metadata.name} → ${destPath}\n`)
      return { success: true, name: metadata.name, dest: destPath }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      process.stderr.write(`✗ ${file}: ${message}\n`)
      return { success: false, file, message }
    }
  })

  const successes = results.filter(r => r.success)
  const failures = results.filter(r => !r.success)

  process.stdout.write(`\n${successes.length}/${files.length} 件を同期しました → ${outputBase}\n`)

  if (failures.length > 0) {
    throw new Error(`${failures.length} 件のエラーが発生しました`)
  }
}

try {
  main()
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
}
