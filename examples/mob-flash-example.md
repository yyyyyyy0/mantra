# Flash-Mob Example

## Context

Existing authentication system (JWT + Session mixed) needs to be refactored into a unified authentication base. Due to the large scope, we want to identify major risks before implementation.

---

## Participants

- `mob-navigator` — Orchestrator
- `planner` — Implementation planning perspective
- `architect` — System design perspective
- `mob-critic` — Adversarial review

---

## Discussion Transcript (abbreviated)

### mob-navigator

[OBSERVATION] Current codebase has JWT-based auth for API routes and session-based auth for web routes. Two separate middleware stacks, duplicated user lookup logic.

[PROPOSAL] Migrate to unified JWT-based auth with refresh token rotation.

### planner

[OBSERVATION] This touches 15+ files across auth/, middleware/, and routes/.

[CHALLENGE] Do we have a clear migration path? Rolling update or big bang?

### architect

[PROPOSAL] Implement feature-flagged dual-write period. New JWT auth runs in shadow mode first.

[RISK] Token rotation logic is complex. Edge case: concurrent requests with expired refresh token.

### mob-critic

[CHALLENGE] What about existing active sessions? Big bang approach would log out all users.

[RISK] Shadow mode may hide race conditions in token validation.

[RISK] Refresh token storage needs secure HTTP-only cookies. Current implementation doesn't have this.

### mob-navigator

[DECISION] Approve feature-flagged migration approach with dual-write period.

[RISK HIGH] Concurrent refresh token requests need idempotency handling.

[ACTION] architect to design token storage and rotation logic. planner to create migration phases.

---

## Normalized Summary

### Objective
Identify major risks for authentication system unification refactor and determine implementation approach.

### Constraints
- Must not interrupt existing active sessions
- No more than 1 hour of downtime allowed

### Observations
- Current: Mixed JWT for API routes, Session for web routes
- Affects 15+ files
- No HTTP-only cookies in current implementation

### Decisions

**Accepted**
- Migration to unified JWT-based authentication
- Feature-flagged dual-write period migration approach
- Adoption of refresh token rotation

**Rejected**
- Big bang approach (leads to session disconnection for all users)

**Deferred**
- Token storage details (pending secure storage selection)

### Risks

| Priority | Description | Mitigation |
|----------|-------------|------------|
| HIGH | Duplicate issuance of concurrent refresh token requests | Implement idempotency keys |
| HIGH | HTTP-only cookies not in use | Implement cookie configuration before migration |
| MEDIUM | Validation gaps in shadow mode | Verify with canary release |
| LOW | Migration logic for existing sessions | Verify during dual-write period |

### Action Plan
1. architect: Design token storage and rotation logic
2. planner: Detailed planning of migration phases (define dual-write period)
3. Run plan-mob in next session to finalize acceptance criteria

### Open Questions
- What token expiration duration should be set?
- How should users be notified on rotation failure?

---

## Key Takeaways

1. **Value of flash-mob**: Identified HIGH risks (concurrent requests, cookie settings) before implementation
2. **mob-critic contribution**: Pointed out big bang risks, guided toward safer dual-write approach
3. **Next step**: Move to plan-mob for concrete design and planning
