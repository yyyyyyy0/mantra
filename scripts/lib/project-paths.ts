import * as path from 'path'

export const PROJECT_ROOT = path.resolve(__dirname, '..', '..')
export const AGENTS_DIR = process.env.MANTRA_AGENTS_DIR ?? path.join(PROJECT_ROOT, 'agents')
export const RULES_DIR = process.env.MANTRA_RULES_DIR ?? path.join(PROJECT_ROOT, 'rules')
export const PACKAGE_JSON_PATH =
  process.env.MANTRA_PACKAGE_JSON_PATH ?? path.join(PROJECT_ROOT, 'package.json')
