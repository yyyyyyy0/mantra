# Testing Requirements

## MUST

1. **Unit + Contract tests are required**
   - Unit tests: functions, utilities, components.
   - Contract tests: CLI/JSON output and script contract stability.
2. **Coverage is required at 80% or higher**
   - Statements: 80%
   - Branches: 80%
   - Functions: 80%
   - Lines: 80%
   - Scope: unit/contract target modules configured in `vitest.config.ts`
3. **CI must enforce the coverage gate**
   - CI must run a coverage-enabled unit/contract test command.
   - The pipeline must fail when thresholds are not met.

## SHOULD

1. **Integration tests**
   - Cover API/file-system boundaries and cross-module behavior.
2. **E2E tests**
   - Cover critical user flows (Playwright).
3. **TDD workflow**
   - RED: write a failing test first.
   - GREEN: implement the minimum passing change.
   - REFACTOR: improve code while keeping tests green.

## Troubleshooting Test Failures

1. Use **tdd-guide** agent
2. Check test isolation
3. Verify mocks are correct
4. Fix implementation, not tests (unless tests are wrong)

## Agent Support

- **tdd-guide** - Use PROACTIVELY for new features, enforces write-tests-first
- **e2e-runner** - Playwright E2E testing specialist
