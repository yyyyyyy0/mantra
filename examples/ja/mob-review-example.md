# Review-Mob Example

## Context

Security-related change implemented: migrating JWT signature algorithm from HS256 to RS256. Conducting merge readiness review.

---

## Participants

- `code-reviewer` — Code quality review
- `security-reviewer` — Security review
- `mob-critic` — Adversarial review
- `mob-scribe` — Normalization and summary

---

## Discussion Transcript (abbreviated)

### code-reviewer

[OBSERVATION] Reviewed PR: Added RSA key generation, updated JWT middleware, migrated existing tokens.

[BLOCKER] No tests for RSA key generation logic. Critical path missing coverage.

[WARNING] `generateKeyPair()` function has 150 lines. Should extract sub-functions.

[RISK LOW] Error handling for JWT verification is generic. May leak debug info in logs.

### security-reviewer

[BLOCKER] Private key is stored in environment variable as plain text. Should use secret management service.

[BLOCKER] No key rotation strategy. If private key is compromised, all tokens are invalidatable.

[WARNING] Token expiration is 24 hours. For RS256 overhead, consider shorter expiration.

[RISK HIGH] Key size is 2048-bit. Recommendation: 3072-bit or 4096-bit for better security.

### mob-critic

[CHALLENGE] What happens during deployment? Old HS256 tokens vs new RS256 tokens?

[RISK MEDIUM] Dual-write period not implemented. Breaking change for active users.

[CHALLENGE] RSA key generation on startup blocks server initialization. Async initialization?

[CHALLENGE] Private key rotation requires server restart. Zero-downtime rotation not possible.

### code-reviewer

[SUGGESTION] Extract key generation logic to separate module for better testability.

[SUGGESTION] Add key rotation endpoint that accepts new public key without restart.

### mob-scribe

[DECISION] Normalize findings into blockers, warnings, suggestions for human review.

---

## Normalized Summary (mob-scribe output)

### Objective
Conduct merge readiness review for security change (RS256 migration) and summarize blockers, warnings, suggestions, and residual risks.

### Constraints
- Security change: CRITICAL/HIGH issues must be resolved before approval

### Observations
- No tests for RSA key generation logic
- Private key stored in plain text environment variable
- No key rotation strategy
- 2048-bit key size (3072-bit+ recommended)

### Blockers (required fixes)

| Priority | Description | Recommended Action |
|----------|-------------|-------------------|
| CRITICAL | No tests for key generation | Add unit tests (minimum coverage) |
| CRITICAL | Private key in plain text env var | Migrate to secret management service |
| HIGH | No key rotation strategy | Implement rotation endpoint |
| HIGH | No dual-write period | Add HS256/RS256 parallel operation period |
| MEDIUM | Active users disconnected during deployment | Implement graceful migration path |

### Warnings (recommended fixes)

- `generateKeyPair()` exceeds 150 lines. Recommend sub-function extraction
- JWT verification error handling is generic. Risk of debug info leak in logs
- Token expiration 24 hours. Consider shortening for RS256 overhead

### Suggestions (improvement proposals)

- Extract key generation logic to separate module (better testability)
- Add key rotation endpoint without server restart
- Async key initialization to avoid server startup block

### Residual Risks (recommended monitoring after approval)

| Priority | Description | Mitigation |
|----------|-------------|------------|
| MEDIUM | Key rotation behavior unverified | Verify with canary release |
| LOW | 2048-bit key size | Upgrade to 3072-bit in next maintenance |

### Recommended Next Actions

1. **BLOCK**: Do not merge. Re-review after resolving CRITICAL/HIGH issues
2. **ACTION**: Add unit tests for key generation logic
3. **ACTION**: Migrate private key to secret management service
4. **ACTION**: Implement dual-write period and key rotation strategy
5. **REVIEW**: Re-run review-mob after above fixes

---

## Key Takeaways

1. **Value of review-mob**: Identified CRITICAL/HIGH blockers for security change
2. **security-reviewer contribution**: Discovered key management, rotation, key size issues
3. **mob-critic contribution**: Pointed out deployment impact (active user disconnection)
4. **Decision**: Block merge, re-review after necessary fixes

## Merge Recommendation

**DO NOT MERGE** — Re-review required after blockers are resolved
