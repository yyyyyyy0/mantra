# Plan-Mob Example

## Context

Planning to add E2E testing infrastructure to the project. Currently have unit tests, but no E2E coverage for critical user flows (login, purchase, password reset).

---

## Participants

- `mob-navigator` — Orchestrator
- `planner` — Implementation planning
- `architect` — System design
- `tdd-guide` — Test strategy
- `mob-critic` — Adversarial review
- `mob-scribe` — Normalization and summary

---

## Discussion Transcript (abbreviated)

### mob-navigator

[OBSERVATION] Project has unit test coverage (~65%) but no E2E tests. Critical user flows are untested.

[DECISION POINT] What E2E framework to use? What should be the first flow to test?

### architect

[OBSERVATION] Current tech stack: Next.js 14, React 18, TypeScript. Deployment target: Vercel.

[PROPOSAL] Use Playwright with Next.js integration. Good TypeScript support, fast execution.

[CHALLENGE] CI/CD pipeline needs to handle E2E tests. Current GitHub Actions workflow only runs unit tests.

### planner

[PROPOSAL] Implementation phases:
1. Setup Playwright in dev environment
2. Configure GitHub Actions for E2E
3. Implement first test: login flow
4. Add purchase flow test
5. Add password reset flow test

[RISK] Phase 2 may require GitHub Actions runner upgrade (timeout issues).

### tdd-guide

[PROPOSAL] Follow TDD: Write failing test first, then implement page objects, then make test pass.

[CHALLENGE] Page Object Model or Page Object Pattern? Recommendation: Page Object Model for better maintainability.

[ACTION] First test should be "login with valid credentials succeeds" - simplest critical path.

### mob-critic

[CHALLENGE] What about flaky tests? E2E tests are notorious for flakiness.

[RISK MEDIUM] Timing-dependent tests may fail intermittently. Need explicit waits, not arbitrary sleeps.

[RISK LOW] Test data management. Should we use dedicated test database or seeding?

[PROPOSAL] Use test-specific database with seeded data. Avoid flakiness from shared state.

### mob-navigator

[DECISION] Playwright + Page Object Model + test database approach.

[ACTION] Documented in mob-scribe summary for human approval.

---

## Normalized Summary (mob-scribe output)

### Objective
Establish implementation plan, acceptance criteria, and verification strategy for E2E testing infrastructure.

### Constraints
- Next.js 14 / React 18 / TypeScript
- Deployment target: Vercel
- Current CI: GitHub Actions (unit tests only)

### Observations
- Unit test coverage ~65%
- No E2E tests
- Critical user flows: login, purchase, password reset

### Decisions

**Accepted**
- Framework: Playwright (with Next.js integration, TypeScript support)
- Pattern: Page Object Model
- Test data: Dedicated test database with seeded data
- First test: "Login with valid credentials succeeds"

**Rejected**
- Shared database (causes flakiness)
- CSS selector-based locators (unstable)

**Deferred**
- Adding Visual Regression Testing (after core flows are stable)
- Adding performance tests (after functional tests are stable)

### Risks

| Priority | Description | Mitigation |
|----------|-------------|------------|
| MEDIUM | Increased CI execution time | Parallel execution configuration |
| MEDIUM | Flaky tests | Explicit waits, avoid fixed sleeps |
| LOW | Test data management | Dedicated test DB + reset before each test |

### Action Plan
1. Set up Playwright in the development environment
2. Add E2E job to GitHub Actions (with parallel execution configuration)
3. Create Page Object Model structure
4. Implement login flow test (TDD: RED → GREEN → IMPROVE)
5. Add purchase flow test
6. Add password reset flow test

### Open Questions
- Is a CI runner upgrade needed? (Evaluate after first run)
- Test execution frequency: every PR or nightly only? (Defer to human)

---

## Acceptance Criteria

- [ ] Playwright runs in local environment
- [ ] E2E tests execute on GitHub Actions
- [ ] Login flow test passes
- [ ] Purchase flow test passes
- [ ] Password reset flow test passes
- [ ] Flaky test rate < 5%

## Verification Strategy

**Unit Tests**
- Each method of the Page Object Model
- Test helper functions

**Integration Tests**
- Integration with GitHub Actions
- Test database seeding functionality

**E2E Tests**
- 3 critical user flows

**Manual Verification**
- Run `npm run test:e2e` in local environment
- Confirm report file readability

---

## Key Takeaways

1. **Value of plan-mob**: Framework, pattern, risks, and acceptance criteria determined before implementation
2. **tdd-guide contribution**: TDD approach and Page Object Model clarified
3. **mob-critic contribution**: Flaky test risks and mitigations discussed
4. **Next step**: Human approval, then start implementation
