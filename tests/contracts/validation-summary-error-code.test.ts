import { describe, expect, it } from 'vitest'
import { selectSummaryErrorCode } from '../../scripts/lib/validation-summary'

describe('Validation summary error-code priority', () => {
  it('prioritizes E_INPUT_INVALID over schema errors', () => {
    const selected = selectSummaryErrorCode(
      ['E_SCHEMA_FRONTMATTER', 'E_INPUT_INVALID'],
      'E_SCHEMA_FRONTMATTER',
    )

    expect(selected).toBe('E_INPUT_INVALID')
  })

  it('uses schema fallback when no E_INPUT_INVALID exists', () => {
    const selected = selectSummaryErrorCode(
      ['E_SCHEMA_RULE', 'E_IO'],
      'E_SCHEMA_RULE',
    )

    expect(selected).toBe('E_SCHEMA_RULE')
  })

  it('falls back to first code when neither input-invalid nor schema fallback exists', () => {
    const selected = selectSummaryErrorCode(['E_IO', 'E_INTERNAL'], 'E_SCHEMA_RULE')

    expect(selected).toBe('E_IO')
  })
})
