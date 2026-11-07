# Persisted domain services

`src/domain/index.ts` exports `createServices(db)` over the parent's real relational SQLite adapter (`src/domain/sqlite.ts`), `createDomainServices(port)`, `DomainError`, contract types and port entity types. All methods are synchronous; all public service calls require trusted `Actor` first. No HTTP, UI, model calls, secret access, package edits, commits or branch changes in this lane.

## Public methods

- `submitReport(actor, ReportInput): Report`: actor-scoped client request receipt; changed input conflicts. Media must belong to submitter and be unattached. Selected colony must be assigned for volunteers. Report, attachments, immediate unverified alert and audit persist atomically. Injuries, kittens/pregnancy and unavailable-feeder text raise same-day review. Other reports conservatively receive watch alerts; no diagnosis is made.
- `getReport(actor,id)`: report plus observations, alerts and (staff only) reviews. Volunteer must own report and still have colony assignment.
- `listColonies(actor)`: assigned colonies for volunteers; precise locations staff only.
- `getColonySummary(actor,id)`: `confirmedCats`, `fixed`, `tnrNeeded`, `tnrUnknown`, `vetReviewNeeded`, `pendingObservations`, `lastFeedingAt`; staff also receives last feeder ID. Counts use active confirmed canonical identities. Alias vet concerns remain visible. Missing feeding remains null, never a claim no one fed.
- `getCat(actor,id)`: scoped identity; staff additionally gets evidence history including aliases for canonical cats. Volunteer receives no raw observation history.
- `listReviews(actor): Review[]`: staff only, **all statuses**. CLI can avoid applying proposals twice.
- `listAlerts(actor)`: open alerts; volunteers only see own-report alerts in assigned colonies. Routine later proposals do not clear earlier alerts.
- `resolveAlert(actor, alertId, reason)`: staff-only; records resolution and an audit event in the same transaction. Repeated resolution conflicts.
- `correctObservationLink(actor, observationId, reason)`: staff-only; detaches one incorrect identity link, preserves the evidence, records the previous cat and reason in the audit, and returns the report to review. A new staff review is required to relink it.
- `applyAgentProposal(actor,proposal): Review[]`: creates observations and pending link reviews. Report ID and attached media IDs are the only accepted evidence IDs. Cat candidates must exist, be active confirmed canonical cats and belong to selected colony. Invented IDs, cross-colony references and visual observations without media fail atomically. No identity mutation. One proposal application per report; duplicate application conflicts rather than duplicating evidence.
- `createReview(actor,{reportId,action,proposedChange,evidenceIds}): Review`: staff-only explicit review creation. Supported shapes: link `{catId,observationIds}`, new cat `{name,observationIds}`, merge `{sourceCatId,targetCatId}`, lifecycle `{catId}`. Colony is validated and frozen in proposedChange. Original proposal, evidence and target cat snapshots are immutable.
- `decideReview(actor,id,{decision,expectedVersion,reason})`: staff only; returns `{reviewId,status,version,catId?}`. Exact semantic retry by same deciding actor returns original receipt; changed decision/reason/version or another actor conflicts. Approval checks frozen target state and still-pending observation associations. Mutation, receipt and audit occur in one immediate transaction. Report completes once no pending reviews or unlinked observations remain.
- `mergeCats(actor,reviewId,decision)`: requires a frozen merge review. Both identities must be active, confirmed and independent. Chains are conservatively rejected. Original observation associations remain unchanged; aliases determine canonical counts.
- `reverseMerge(actor,mergeId,reason)`: staff only; rejects if source or target state/version changed or later merge topology makes reversal unsafe. Marks alias reversed and audits; evidence remains attached to original identity. Repeated reversals conflict.
- `recordFeedingVisit(actor,{clientRequestId,colonyId,occurredAt,evidence})`: explicit completion evidence required, actor-scoped idempotency and immutable occurrence records. Latest feeding is chosen by parsed occurrence instant, never receipt time. Future feeding invalid.
- `getAggregateReport(actor)`: staff only; numeric totals only, no IDs, coordinates, contacts, text or evidence. No sponsor role introduced.

## Persistence and integration

DomainPort is narrow and synchronous: get/all/put plus serializable transaction. Production factory uses the authoritative schema in src/db, not a shadow JSON store. Adapter selectively updates state fields to respect immutable-evidence triggers. Parent owns adapter and runtime-validation helpers; DB worker owns schema/seed. Actor identity, role and assignments must come from session infrastructure, never submitted JSON. Parent validation helpers enforce bounded runtime ReportInput/AgentProposal shapes; timestamp helper validates real UTC calendar dates.

Example: submitReport returns `.id`; proposal evidenceIds can be `[report.id]`; applyAgentProposal returns review array with `.id` and `.version`; decideReview uses that frozen version. All statuses from listReviews support deterministic CLI replay.

## Verification

`npm run typecheck`: passed.
`npm test`: 25 tests passed in 6 files on 2026-11-07, including ten real-SQLite domain tests and parent persistence tests. Coverage includes assigned colony/own evidence privacy, staff-only decisions/aggregate, exact retry property/media ordering, stale/changed/cross-user decisions, invented references, two distinct photos with one counted identity, wrong match rejection, changed target conflict, immediate concerns without model, explicit late feeding, unknown TNR, merges/reversal with retained evidence and concerns, chain rejection, restart receipts and injected audit failure rolling back identity link plus review.

## Boundaries

Urgency keyword detection is deliberately conservative and English-only, not a clinical classifier. All new reports require a selected colony. No service edits immutable routing evidence. Proposal reruns with changed output intentionally conflict; a future reprocessing workflow must preserve old review history. Staff can create a review to confirm a new cat from an unlinked observation, but an agent result with zero observations cannot yet be retried with new output. List operations scan bounded demo data; pagination/indexed scoped queries are future production work. Failed/rejected observations remain pending until explicitly linked or confirmed; rejection never silently deletes evidence. No media upload transport, authentication/session implementation or external inference is supplied here.
