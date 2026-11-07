# Backend 1 — database and fixtures

Copy this entire prompt into your coding chat alongside 00-shared-contract.md.

You are implementing this lane for https://github.com/svertexy/mewsops. Read docs/team-prompts/00-shared-contract.md and existing project instructions first. Evaluate current repository state; the starter is scaffolding and reset may still be a placeholder. Implement the requested behavior, verify it, and open a focused PR. Work on branch codex/backend-data. Do not change other lanes' files or merge your own PR.

## Your file ownership
src/db/**, fixtures/data/**, tests/db/**, scripts/demo-reset.ts. Your handoff document named below is also yours.

## Assignment
Implement SQLite migrations, connection lifecycle and repository functions. Tables: users, colony_assignments, colonies, cats, reports, media, observations, feeding_visits, alerts, review_requests, audit_events and merge_aliases. Keep lifecycle (active/adopted/missing), sterilization (unknown/fixed/not_fixed), identity confirmation and vet-review status separate. Counts derive from canonical IDs, not photo count. Preserve evidence and observation links through reversible merges. Store occurrence time and receipt time separately.

Provide createDatabase(path), migrate(db), seedDemo(db), repositories(db). Prefer explicit transactions and prepared statements; enforce foreign keys and unique client request IDs scoped to actor. Coordinate exact service calls with Backend 2. Do not implement HTTP or OpenAI.
Seed 18 fictional colonies and 20 fictional users but concentrate rich scenarios in three colonies and roughly 12 cats; no need for 100 handcrafted cats. Include two distinct synthetic image references for one cat, lookalike cats, kittens reported but unconfirmed, unknown TNR, stale feeding data and an unavailable feeder. Assets are references until provided; do not fabricate image existence.
Replace reset placeholder with a real explicit demo-database reset. Refuse arbitrary database paths and preserve non-demo files. Test fresh migration, rerun, foreign keys, unique ingestion, count calculations, merge alias correctness and deterministic seed. Publish a schema dictionary and repository examples in docs/backend-data.md.

## Execution and handoff
1. Inspect current code, branch state, available dependencies and instructions.
2. List exports and integration dependencies before implementation. Send contract mismatches to the coordinator with a concrete proposed change.
3. Build the smallest end-to-end lane slice first; use named temporary adapters where dependencies are missing.
4. Run typecheck and meaningful tests for your scope. Record actual results; do not mark placeholders complete.
5. Review the diff for secrets, unrelated changes and broken contracts.
6. Commit only your lane files and open a PR to main, including behavior, verification, limitations and dependencies on other PRs.
7. Finish with PR URL, changed files, exported interfaces, test results, unresolved integration issues and the next teammate action.
