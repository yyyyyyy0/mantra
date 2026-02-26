import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { buildSkillContent, CodexFrontmatter } from './lib/codex-utils'
import { writeAtomic } from './lib/fs-utils'
import { RULES_DIR } from './lib/project-paths'
import { getProjectMeta } from './lib/project-meta'
import { parseRuleFile } from './lib/rule-parser'
import type { ParsedRule } from './lib/rule-parser'

type RuleMetadataType = ParsedRule['metadata']

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

// ────────────────────────────────────────────────────────────
// 変換
// ────────────────────────────────────────────────────────────

function convertToCodexFrontmatter(
  src: RuleMetadataType,
  metadataVersion: string,
  metadataLicense: string,
): CodexFrontmatter {
  return {
    name: src.name,
    description: src.description,
    license: metadataLicense,
    compatibility: 'Works with any codebase',
    metadata: {
      author: 'mantra-project',
      version: metadataVersion,
      category: inferCategory(src.name),
      tags: ['claude-code', src.name],
    },
  }
}


// ────────────────────────────────────────────────────────────
// メイン
// ────────────────────────────────────────────────────────────

function main(): void {
  const rulesDir = RULES_DIR
  const outputBase = path.join(os.homedir(), '.codex', 'skills', 'mantra-rules')
  const projectMeta = getProjectMeta()

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
      const codexFm = convertToCodexFrontmatter(
        metadata,
        projectMeta.version,
        projectMeta.license,
      )
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
