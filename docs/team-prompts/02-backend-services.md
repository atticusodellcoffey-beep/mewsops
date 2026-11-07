# Backend 2 — domain policies and review workflow

Copy this entire prompt into your coding chat alongside 00-shared-contract.md.

You are implementing this lane for https://github.com/svertexy/mewsops. Read docs/team-prompts/00-shared-contract.md and existing project instructions first. Evaluate current repository state; the starter is scaffolding and reset may still be a placeholder. Implement the requested behavior, verify it, and open a focused PR. Work on branch codex/backend-services. Do not change other lanes' files or merge your own PR.

## Your file ownership
src/domain/**, tests/domain/**. Your handoff document named below is also yours.

## Assignment
Implement scoped service functions over Backend 1 repositories: submitReport, getReport, listColonies, getColonySummary, listReviews, decideReview, getCat, listAlerts, recordFeedingVisit, mergeCats, getAggregateReport. Accept trusted actor context explicitly. Enforce permissions at every public service entry.
Use transactions for approval + canonical mutation + audit. Sensitive actions require staff and pending frozen review version; retries return original receipt. Merges retain both source identities through aliases and support reversal without deleting evidence. Concurrent stale approvals return conflict.
Append reported concerns immediately as unverified alerts, even if cat identity or AI is pending. Do not clear alerts because a later photo looks normal. Feeding timestamp updates only from explicit feeding evidence; unknown TNR must not enter the confirmed TNR-needed total. Reports expose confirmed census plus pending observations separately.
Deliver real service behavior with a narrow DB port if repositories aren't ready. In-memory test implementations are test-only. Tests must cover cross-colony access, volunteer approval denial, duplicate retries, stale reviews, same cat/two images counts, wrong-match rejection, feeding semantics and sponsor privacy. Document signatures in docs/backend-services.md. Do not implement transport or model calls.

## Execution and handoff
1. Inspect current code, branch state, available dependencies and instructions.
2. List exports and integration dependencies before implementation. Send contract mismatches to the coordinator with a concrete proposed change.
3. Build the smallest end-to-end lane slice first; use named temporary adapters where dependencies are missing.
4. Run typecheck and meaningful tests for your scope. Record actual results; do not mark placeholders complete.
5. Review the diff for secrets, unrelated changes and broken contracts.
6. Commit only your lane files and open a PR to main, including behavior, verification, limitations and dependencies on other PRs.
7. Finish with PR URL, changed files, exported interfaces, test results, unresolved integration issues and the next teammate action.
