import * as yaml from 'js-yaml'

export interface CodexFrontmatter {
  name: string
  description: string
  license: string
  compatibility: string
  allowed_tools?: string[]
  model?: string
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
  const { allowed_tools, ...rest } = codexFm
  const dumpTarget: Record<string, unknown> = { ...rest }
  if (allowed_tools && allowed_tools.length > 0) {
    dumpTarget['allowed-tools'] = allowed_tools
  }
  const frontmatterYaml = yaml.dump(dumpTarget, YAML_DUMP_OPTIONS).trimEnd()
  return `---\n${frontmatterYaml}\n---\n\n${body}`
}
