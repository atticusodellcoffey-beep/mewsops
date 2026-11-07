# UI designer — volunteer and staff experience

Copy this entire prompt into your coding chat alongside 00-shared-contract.md.

You are implementing this lane for https://github.com/svertexy/mewsops. Read docs/team-prompts/00-shared-contract.md and existing project instructions first. Evaluate current repository state; the starter is scaffolding and reset may still be a placeholder. Implement the requested behavior, verify it, and open a focused PR. Work on branch codex/ui-reference-design. Do not change other lanes' files or merge your own PR.

## Your file ownership
ui/**, tests/ui/**. Your handoff document named below is also yours.

## Assignment
Use the human designer's supplied references as the visual direction. Obtain missing reference details from your teammate while building neutral layouts and API interfaces; do not invent a final brand direction without their input. Deliver a simple responsive interface with intentional typography, spacing, readable contrast, clear hierarchy and few actions per screen.
Own both volunteer and staff surfaces. Volunteer: assigned colony, text, photo, synthetic location attachment, submit and receipt. Target 1–2 minutes. Preserve typed draft on recoverable errors. No real geolocation in the synthetic demo.
Staff: Today (urgent/unreviewed), Colonies, review detail and basic cat detail. Show original evidence beside proposed fields, separate reported/AI/confirmed badges, side-by-side different photo comparison and Approve/Keep separate/Needs more evidence. Merge is a separate explicit action from linking one observation. Adopted/missing actions require confirmation and reason. Show expected census impact before approval.
Colony cards need confirmed cats, fixed/not-fixed/unknown, vet-review cases, last confirmed feeding and last report (distinct timestamps). Keep pending sightings separate from confirmed cats. Urgent unverified reports remain visible before staff finishes identity review.
Build on the API contract owned by integrator. Use a single typed client and swappable mock transport inside ui; no hard-coded production results. Handle loading, empty, retry, unauthorized, failed inference, pending review and stale-version conflict. Never put secret values in frontend. Hiding a control does not replace server authorization.
Demo three stories: routine feeding; two different photos confirmed as one cat; urgent report with unclear identity that remains visible. Include an unavailable-feeder card. Reference images and generated synthetic cat assets must have documented provenance. Do not use real rescue photos.
Test phone layout, keyboard access, form recovery, review flow and API error states. Document how to run against fixtures and live local backend in docs/ui-handoff.md. Coordinate frontend tooling changes with integrator; do not restructure backend or overwrite shared package files.

## Execution and handoff
1. Inspect current code, branch state, available dependencies and instructions.
2. List exports and integration dependencies before implementation. Send contract mismatches to the coordinator with a concrete proposed change.
3. Build the smallest end-to-end lane slice first; use named temporary adapters where dependencies are missing.
4. Run typecheck and meaningful tests for your scope. Record actual results; do not mark placeholders complete.
5. Review the diff for secrets, unrelated changes and broken contracts.
6. Commit only your lane files and open a PR to main, including behavior, verification, limitations and dependencies on other PRs.
7. Finish with PR URL, changed files, exported interfaces, test results, unresolved integration issues and the next teammate action.
