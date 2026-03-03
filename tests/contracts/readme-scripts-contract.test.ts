import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'

function loadPackageScripts(): Record<string, string> {
  const packageJsonPath = path.join(process.cwd(), 'package.json')
  const packageJsonRaw = fs.readFileSync(packageJsonPath, 'utf8')
  const packageJson = JSON.parse(packageJsonRaw) as { scripts?: Record<string, string> }

  if (packageJson.scripts === undefined) {
    throw new Error('package.json scripts not found')
  }

  return packageJson.scripts
}

function loadReadmeScriptCommands(): string[] {
  const readmePath = path.join(process.cwd(), 'README.md')
  const readmeRaw = fs.readFileSync(readmePath, 'utf8')
  const lines = readmeRaw.split('\n')

  const scriptsHeaderIndex = lines.findIndex(line => line.trim() === '## スクリプト')
  if (scriptsHeaderIndex < 0) {
    throw new Error('README scripts section not found')
  }

  const commands: string[] = []

  for (let i = scriptsHeaderIndex + 1; i < lines.length; i += 1) {
    const line = lines[i]

    if (line.startsWith('## ') || line.trim() === '---') {
      break
    }

    const match = line.match(/\|\s*`(npm run [^`]+)`\s*\|/)
    if (match !== null) {
      commands.push(match[1])
    }
  }

  return commands
}

function parseBaseScript(command: string): string {
  const npmRunPrefix = 'npm run '
  if (!command.startsWith(npmRunPrefix)) {
    throw new Error(`unsupported command format: ${command}`)
  }

  const tail = command.slice(npmRunPrefix.length).trim()
  const [baseScript] = tail.split(/\s+/)

  if (baseScript === undefined || baseScript.length === 0) {
    throw new Error(`script name is missing: ${command}`)
  }

  return baseScript
}

describe('README scripts contract', () => {
  it('documents only npm run scripts that exist in package.json', () => {
    const scripts = loadPackageScripts()
    const commands = loadReadmeScriptCommands()

    expect(commands.length).toBeGreaterThan(0)

    for (const command of commands) {
      const baseScript = parseBaseScript(command)
      expect(
        scripts[baseScript],
        `README command "${command}" points to missing script "${baseScript}"`,
      ).toBeDefined()
    }
  })
})
