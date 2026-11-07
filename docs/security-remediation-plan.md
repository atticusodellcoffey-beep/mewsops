# MewsOps security remediation and mobile-readiness plan

## Current stack and verified boundary

- TypeScript on Node.js, with `better-sqlite3` for local persistence.
- Zod for structured input validation and Vitest for automated tests.
- `@openai/agents` is installed, but live model execution and agent tools are not implemented.
- The current artifact is a local domain/backend prototype. It is not yet an HTTP API, authenticated phone app, upload service, or hosted deployment.

The security contract is: AI proposes; deterministic code validates; staff approve sensitive identity/state changes. Client input must never be treated as agent output, authority, evidence provenance, or a storage path.

## Implemented in this push

1. Agent proposal application now requires a staff actor, so a volunteer cannot inject observations, urgency, reviews, receipts, or audit events through the domain method.
2. Schema validation now runs on every migration/startup, including already-versioned databases.
3. Required append-only/evidence triggers and active-alert/active-alias partial indexes are checked by name and SQL semantics.
4. SQLite foreign-key enforcement and `PRAGMA integrity_check` are fail-closed requirements.
5. A regression test proves a volunteer-forged proposal produces no durable rows.

This is a local hardening step, not a claim that a future client can safely call the method. The eventual API must expose only a process command; the server loads the report/evidence, invokes the agent, validates the structured result, and applies it through a private orchestration boundary.

## Security workstream

### P0: trust boundaries

- Keep `Actor` derived from a verified session; never deserialize role or colony assignments from request JSON.
- Replace the temporary staff-only guard with a server-only capability/module boundary before exposing an API. A TypeScript interface or `{ kind: "agent" }` JSON field is not sufficient.
- Reject client-supplied proposal bodies, evidence IDs, review receipts, and model metadata at the transport layer.
- Keep human approval mandatory for cat identity, merges, adoption, and missing-state changes.

### P1: authorization and privacy

- Implement signed-session verification, issuer/audience/expiry/revocation checks, and disabled-user rejection.
- Enforce authorization independently on reports, cats, colonies, alerts, reviews, and media.
- Return explicit staff/volunteer DTOs; never serialize database rows.
- Hide exact colony locations, feeder identity, private media references, and other users' reports from volunteer responses.
- Add IDOR/BOLA tests for guessed IDs across users and colonies.

### P1: database integrity and auditability

- Keep startup schema checks fail-closed for triggers, indexes, foreign keys, constraints, and integrity checks.
- Add tamper-evident audit fields (sequence, previous hash, event hash) when production audit requirements are defined.
- Remove broad write access to protected tables from future route code; use narrow domain commands.
- Add concurrency tests for report retries, proposal receipts, review approvals, merges, and alert escalation.

### P1: retry semantics

- Same actor + same normalized command returns the original receipt.
- Changed payload, actor, or stale version returns a deterministic `409`.
- Agent failure or timeout creates no observations/review receipt and never clears an urgent reporter alert.
- Mobile clients must use idempotency keys and show unknown-outcome states after interrupted requests.

### P2: media and phone web app

- Use a mobile-friendly installable web app for the hackathon; no app-store packaging is required.
- Store photos privately with opaque keys; validate content signatures, size, dimensions, and frame count; strip EXIF GPS metadata; quarantine suspicious files; issue short-lived authorization-checked URLs.
- Add body/upload limits, per-user/IP rate limits, agent budgets/timeouts, CSRF protection for cookie auth, strict CORS, secure headers, and redacted errors.
- Never cache private API responses in a service worker. Queue only safe report creation with idempotency keys; never queue staff approvals automatically.

## Agent conversation and approval record

Four independent reviewers were asked to attack the backend as offensive security, database, API/mobile, and skeptical security leads. They converged on the volunteer-forged-agent proposal as the P0, incomplete schema checks as P1, and missing HTTP/session/media controls as release gates rather than present vulnerabilities. The skeptical lead conditionally approved this plan only after requiring startup-time verification and a genuinely non-forgeable server capability for the eventual API.

## Release gates

The backend may be demonstrated with synthetic data after typecheck, tests, demo replay, and dependency audit pass. It must not be described as production-secure until real session verification, route-level authorization, private media handling, hosted durable storage, rate limits, CSRF/CORS policy, and adversarial API tests are implemented.
