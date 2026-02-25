import * as yaml from 'js-yaml'

export interface CodexFrontmatter {
  name: string
  description: string
  license: string
  compatibility: string
  metadata: {
    author: string
    version: string
    category: string
    tags: string[]
  }
}

export const YAML_DUMP_OPTIONS = {
  lineWidth: -1,
  quotingType: '"',
  forceQuotes: false,
} as const satisfies yaml.DumpOptions

export function buildSkillContent(codexFm: CodexFrontmatter, body: string): string {
  const frontmatterYaml = yaml.dump(codexFm, YAML_DUMP_OPTIONS).trimEnd()
  return `---\n${frontmatterYaml}\n---\n\n${body}`
}
