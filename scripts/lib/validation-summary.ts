import type { CliErrorCode } from './cli-telemetry'

export function selectSummaryErrorCode(
  errorCodes: CliErrorCode[],
  schemaFallback: Extract<CliErrorCode, 'E_SCHEMA_FRONTMATTER' | 'E_SCHEMA_RULE'>,
): CliErrorCode {
  if (errorCodes.includes('E_INPUT_INVALID')) {
    return 'E_INPUT_INVALID'
  }
  if (errorCodes.includes(schemaFallback)) {
    return schemaFallback
  }
  return errorCodes[0] ?? schemaFallback
}
