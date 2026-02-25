import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as yaml from 'js-yaml'
import { z } from 'zod'
import { buildSkillContent, CodexFrontmatter } from './lib/codex-utils'
import { writeAtomic } from './lib/fs-utils'

// ────────────────────────────────────────────────────────────
// スキーマ定義
// ────────────────────────────────────────────────────────────

const SAFE_NAME_RE = /^[a-zA-Z0-9_-]+$/

const ClaudeAgentFrontmatter = z.object({
  name: z
    .string()
    .regex(SAFE_NAME_RE, 'name には英数字・ハイフン・アンダースコアのみ使用できます'),
  description: z.string(),
  tools: z.array(z.string()).optional().default([]),
  model: z.string().optional(),
})

type ClaudeAgentFrontmatter = z.infer<typeof ClaudeAgentFrontmatter>

// ────────────────────────────────────────────────────────────
// カテゴリマッピング
// ────────────────────────────────────────────────────────────

const CATEGORY_MAP: Record<string, string> = {
  planner: 'planning',
  architect: 'architecture',
  'tdd-guide': 'testing',
  'code-reviewer': 'review',
  'security-reviewer': 'security',
  'build-error-resolver': 'build',
  'e2e-runner': 'testing',
  'mob-navigator': 'planning',
  'mob-critic': 'review',
  'mob-scribe': 'documentation',
  'refactor-cleaner': 'refactoring',
  'doc-updater': 'documentation',
}

function inferCategory(name: string): string {
  return CATEGORY_MAP[name] ?? 'development'
}

// ────────────────────────────────────────────────────────────
// パーサー
// ────────────────────────────────────────────────────────────

interface ParsedAgent {
  frontmatter: ClaudeAgentFrontmatter
  body: string
}

function parseAgentFile(content: string): ParsedAgent {
  const DELIMITER = '---'
  const lines = content.split('\n')

  if (lines[0] !== DELIMITER) {
    throw new Error('フロントマターが見つかりません（先頭に --- がありません）')
  }

  const endIndex = lines.indexOf(DELIMITER, 1)
  if (endIndex === -1) {
    throw new Error('フロントマターの終端 --- が見つかりません')
  }

  const rawYaml = lines.slice(1, endIndex).join('\n')
  const parsed = yaml.load(rawYaml, { schema: yaml.DEFAULT_SCHEMA })
  const frontmatter = ClaudeAgentFrontmatter.parse(parsed)
  const body = lines.slice(endIndex + 1).join('\n').trimStart()

  return { frontmatter, body }
}

// ────────────────────────────────────────────────────────────
// 変換
// ────────────────────────────────────────────────────────────

function convertFrontmatter(src: ClaudeAgentFrontmatter): CodexFrontmatter {
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
  const agentsDir = path.join(process.cwd(), 'agents')
  const outputBase = path.join(os.homedir(), '.codex', 'skills', 'mantra')

  const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'))
  if (files.length === 0) {
    throw new Error(`agentsディレクトリにMarkdownファイルが見つかりません: ${agentsDir}`)
  }

  type Result =
    | { success: true; name: string; dest: string }
    | { success: false; file: string; message: string }

  const results: Result[] = files.map(file => {
    const srcPath = path.join(agentsDir, file)
    try {
      const content = fs.readFileSync(srcPath, 'utf8')
      const { frontmatter, body } = parseAgentFile(content)
      const codexFm = convertFrontmatter(frontmatter)
      const skillContent = buildSkillContent(codexFm, body)

      const destPath = path.join(outputBase, frontmatter.name, 'SKILL.md')
      writeAtomic(destPath, skillContent, outputBase)

      process.stdout.write(`✓ ${frontmatter.name} → ${destPath}\n`)
      return { success: true, name: frontmatter.name, dest: destPath }
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

main()
