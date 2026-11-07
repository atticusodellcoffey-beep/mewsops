# Backend verification — November 7, 2026

## Verified implementation

- Real SQLite migrations, deterministic fictional fixtures, immutable evidence and guarded demo reset.
- 18 colonies, 20 users and 12 cat records, with 11 initially confirmed identities.
- Scoped report intake, media ownership checks, urgent reported concerns, canonical census, separate unknown TNR and explicit feeding history.
- Frozen staff reviews, transactional approval and audit, changed-state conflicts, actor-scoped retry receipts and reversible merges.
- Bounded runtime validation for report/model-proposal payloads and real UTC calendar-date validation.
- Staff/private versus volunteer/assigned-colony projections; staff-only numeric aggregate output.

## Executed checks

| Command/check | Observed result |
|---|---|
| `npm run typecheck` | Passed, including test sources |
| `npm test` | 29 tests passed across 7 files |
| `npm run demo-reset -- --confirm-demo-reset` | Reset the marked synthetic local database successfully |
| `npm run demo` | Persisted injury report, immediate alert, fixture proposal, explicit simulated staff approval and linked observation |
| Second `npm run demo` | Reused existing report/review without duplicating approved identity or census |
| Database close/reopen test | Report and decision receipts survived reopening |
| Injected audit failure | Approval, evidence association and review decision rolled back together |
| Distinct synthetic media-reference test | Two pending observations linked to one existing cat; census unchanged |
| `git diff --check` | Passed |
| `npm audit --omit=dev` | 0 production vulnerabilities reported |
| Local database ignore check | Demo database excluded from Git |

Three development agents contributed database implementation, domain implementation and adversarial review. Subsequent review found gaps in an earlier claim of complete schema checks and a verified session boundary. Schema checks are now stronger but depend on connection settings and a version-specific SQL reference. The session helper assumes its input is already verified; it does not verify sessions. See [security research and implementation workplan](security-research-workplan.md) for current findings, tests and release blockers.

## What this does not verify

There is no HTTP server/session implementation, image upload/sanitation service, real image comparison, live OpenAI call, or hosted Vercel persistence in this increment. Synthetic photo references do not claim files exist. The CLI proposal is a deterministic fixture, not a captured model response.

The `vetReviewNeeded` figure reflects recorded review needs (including merged aliases). An unverified injury report remains an urgent concern; approving its identity link does not diagnose illness or independently confirm a medical status. UI should show the open concern alongside the recorded colony state.

Urgency uses conservative English keywords. Queries scan a small demo dataset. Production pagination, authentication, durable hosted storage, alert resolution and a deliberate proposal-reprocessing workflow remain integration work. Staff reports without a selected colony are retained but cannot yet be processed; the phone flow should require colony selection.

See [teammate handoff](backend-handoff.md), [service signatures](backend-services.md), and [database contract](backend-data.md).
