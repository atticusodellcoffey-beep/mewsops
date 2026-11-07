# Agent/API 2 — HTTP, contracts and orchestration

Copy this entire prompt into your coding chat alongside 00-shared-contract.md.

You are implementing this lane for https://github.com/svertexy/mewsops. Read docs/team-prompts/00-shared-contract.md and existing project instructions first. Evaluate current repository state; the starter is scaffolding and reset may still be a placeholder. Implement the requested behavior, verify it, and open a focused PR. Work on branch codex/api-integration. Do not change other lanes' files or merge your own PR.

## Your file ownership
src/api/**, src/contracts/**, src/app.ts, tests/api/**. Your handoff document named below is also yours.

## Assignment
Own shared Zod/TypeScript contracts and the server composition layer. Publish contracts first so other lanes can code in parallel. Coordinate changes instead of silently renaming fields.
Build API routes: GET /api/health; POST /api/media; POST /api/reports; GET /api/reports/:id; POST /api/reports/:id/process; GET /api/colonies; GET /api/colonies/:id; GET /api/cats/:id; GET /api/reviews; POST /api/reviews/:id/decision; GET /api/alerts; GET /api/summary. Delegate business rules to Backend 2 and inference to Agent 1.
Resolve actors from server-managed demo sessions. A role string from client is never authority. Clearly restrict demo session switching to synthetic demo mode. Private media access must check assignment/staff authorization. Validate file type/size, sanitize metadata, hash exact content, limit image dimensions and avoid arbitrary remote fetches. Exact file dedup is separate from animal identity.
Persist report before inference. On timeout return durable pending/failed status and allow manual review/retry without duplicates. User-visible urgent tags should remain discoverable without successful inference. Keep polling simple; avoid new queue infrastructure. Process retry must not create duplicate observations or alerts.
Supply consistent envelopes, IDs, status codes and examples. Add fixtures that frontend can use before integration, clearly labeled. Protect API keys server-side, broad .env ignore rules, request logging redaction and scoped data projection. API tests cover auth, upload errors, report→proposal→review→approved change, invalid output, retries and private media.
Document local startup and Vercel deployment prerequisites: durable external DB/media required; do not claim local SQLite/upload directories persist in serverless hosting. Do not deploy or provision paid services. Deliver docs/api-contract.md and docs/integration.md.

## Execution and handoff
1. Inspect current code, branch state, available dependencies and instructions.
2. List exports and integration dependencies before implementation. Send contract mismatches to the coordinator with a concrete proposed change.
3. Build the smallest end-to-end lane slice first; use named temporary adapters where dependencies are missing.
4. Run typecheck and meaningful tests for your scope. Record actual results; do not mark placeholders complete.
5. Review the diff for secrets, unrelated changes and broken contracts.
6. Commit only your lane files and open a PR to main, including behavior, verification, limitations and dependencies on other PRs.
7. Finish with PR URL, changed files, exported interfaces, test results, unresolved integration issues and the next teammate action.
