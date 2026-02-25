import * as fs from 'node:fs'
import * as path from 'node:path'

export function writeAtomic(destPath: string, content: string, outputBase: string): void {
  const resolved = path.resolve(destPath)
  const resolvedBase = path.resolve(outputBase)
  if (!resolved.startsWith(resolvedBase + path.sep)) {
    throw new Error(`パストラバーサルを検出しました: ${destPath}`)
  }

  const dir = path.dirname(resolved)
  fs.mkdirSync(dir, { recursive: true })

  const tmpPath = `${resolved}.tmp.${process.pid}.${Date.now()}`
  try {
    fs.writeFileSync(tmpPath, content, 'utf8')
    fs.renameSync(tmpPath, resolved)
  } catch (err) {
    try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
    throw err
  }
}
