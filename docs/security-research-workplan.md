# Security research and implementation workplan

## Baseline and scope

MewsOps is a synthetic-data local TypeScript/Node prototype. SQLite/better-sqlite3 stores reports, media metadata, cats, colonies, observations, alerts, review requests, audit events, aliases and proposal receipts. Zod validates some inputs; Vitest exercises services. The Agents SDK is installed, but no live agent, HTTP server, verified login, upload service, phone UI or hosted storage exists. The frontend team works separately. This plan makes no production-security claim.

## Research and threat model

Trace the complete report → evidence → proposal → frozen candidates → human decision → canonical census flow. Treat report text, photos, client JSON, identifiers and model responses as untrusted. Consider forged staff/volunteer context, unauthorized IDs, prompt injection, stale snapshots, duplicate operations, cross-report/colony evidence, tampered schema and audit history, media metadata leakage, and lost mobile requests. Review OWASP API object authorization, file upload and GenAI prompt injection guidance and SQLite's distinct integrity and foreign-key checks.

## Review workflow

Independent offensive/security, database, AI/backend and mobile/API perspectives challenge each other's concrete reproductions and proposed mitigations. The coordinator reconciles them, records material disagreements and acceptance criteria before implementing. Do not invent consensus or treat an agent approval as proof of security.

## Prioritized implementation and acceptance criteria

1. **Frozen cat integrity:** single-target and alternative candidate decisions must accept only frozen, active, confirmed, canonical, same-colony identities; compare frozen candidate snapshots and version. Regression tests exercise wrong eligible cat, cross-colony/invalid targets and changed candidates.
2. **Proposal provenance:** ordinary users cannot apply model output. Design a server-only orchestration capability, never a JSON role/flag. Preserve atomic rollback, explicit human review and urgent reporter alerts. Since real authenticated HTTP/worker infrastructure does not exist, document its trust boundary and do not claim a remotely unforgeable system until it is integrated and tested.
3. **Schema integrity:** verify expected table/index/trigger definitions and integrity/foreign-key checks on startup; reject missing/altered safeguards and orphan rows without repairing data. Preserve existing databases and test tampering. Use versioned migration strategy; never silently reset.
4. **Validation and retry:** review all public inputs for controlled errors, bounded types and unknown keys; define proposal retry result precisely, test after an intervening decision and restart; ensure audit rows are append-only and concurrent decisions conflict deterministically.
5. **Privacy boundary:** test cross-user/colony access and minimize service outputs. Actor objects remain trusted internal inputs, not verified sessions; real signed verification, revocation, issuer/audience/expiry, disabled users and request-derived authority require future transport implementation.
6. **Phone/API release gates:** mobile web/PWA must offer small-screen capture, explicit receipt, safe idempotent draft recovery, no offline approval queue, private media, upload validation/metadata stripping, no private cache, and appropriate session, CSRF/CORS, rate limits, redacted errors and role/ownership checks. No real photos or real locations for this hackathon. API/agent/UI teammates retain their lanes.
7. **Verification:** meaningful regression tests for each implemented fix, typecheck, complete tests, safe non-destructive demo, SQLite integrity and foreign-key checks, dependency audit, diff review, then focused commits and push. Existing local demo data must not be reset without a separate need.

## Delivery

Document exact implemented versus future-only controls, test results and limitations, peer discussion, stack and mobile readiness. Report changes, commit and push status. User-selected delivery: fictional hackathon data and mobile website/add-to-home-screen; no claim of working live OpenAI, real sessions, upload security or durable Vercel storage until demonstrated.

References: https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/ ; https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html ; https://genai.owasp.org/glossary/prompt-injection/ ; https://sqlite.org/pragma.html .

## Review dialogue and implemented findings

The offensive, database and AI/mobile reviewers exchanged direct messages. They independently reproduced selection of cat-2 from a review frozen for cat-1; a volunteer-ID/staff-role forged actor; acceptance of weakened triggers/indexes and orphan rows; and audit replacement. They distinguished internal service/database access from a remotely exploitable API, which does not yet exist. They challenged the initial proposed versioned-trigger migration on historical compatibility and migration ordering. This increment instead retains the v1 schema, turns recursive triggers on at connection creation, requires that setting at verification, compares protected SQLite definitions to a fresh v1 reference, rejects extra triggers/indexes on protected tables and checks foreign-key violations. Exact SQL checks deliberately reject semantically equivalent but differently defined schemas; only this repository's v1 schema is supported. Unexpected objects on non-protected tables are not checked. Someone with arbitrary connection/schema access can still change pragmas or alter both data and safeguards; these checks do not reconstruct prior audit history.

The cat approval now requires the selected cat in both the frozen proposal and snapshot. Eight new regression cases cover wrong cat, removed/disabled trigger, weakened index, extra persistent and temporary triggers, disabled foreign keys/orphan records, and REPLACE audit rewriting. Typecheck and 38 tests pass; local fixture demo and `npm audit --omit=dev` passed. Demo was run on existing synthetic data without reset. Exact comparison preserves SQL literal whitespace, and temporary triggers/indexes on protected tables are rejected. No verified authentication or private agent capability has been implemented; staff-shaped `Actor` objects remain forgeable by an untrusted caller, so exposing these methods directly is a release blocker. Proposal retries currently return current review objects, not necessarily the original response. The prior `docs/backend-verification.md` claim of complete schema checks and server-session verification should be read subject to these explicit limits.

After challenging the first implementation, all three active reviewers approved this narrower local hardening scope. They specifically did not approve a claim of production or remote API security. The schema reviewer tested an extra temporary audit trigger; the offensive reviewer ran the focused suite. A verified session provider, private model-execution boundary, upload handling, full runtime input validation and mobile/API testing remain future work.
