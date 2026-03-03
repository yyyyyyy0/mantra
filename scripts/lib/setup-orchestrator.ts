import { writeInfo } from './cli-telemetry'

export const SETUP_CORE_NEXT_STEP = 'npm run validate'
export const SETUP_OPTIONAL_NEXT_STEP = 'npm run sync:codex'

export function getSetupSuccessOutputLines(): string[] {
  return [
    'セットアップが完了しました。',
    `Core next step: ${SETUP_CORE_NEXT_STEP}`,
    `Optional next step: ${SETUP_OPTIONAL_NEXT_STEP}`,
  ]
}

export function writeSetupSuccessOutput(json: boolean): void {
  for (const line of getSetupSuccessOutputLines()) {
    writeInfo(json, line)
  }
}
