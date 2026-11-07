# Shared implementation agreement

Build MewsOps for the Mangrove Mews bonus challenge. Read this document before your lane prompt. This is a five-person team: backend data, backend services, agent intelligence, API integration, and reference-led UI. Each person owns testing and documentation for their changes; the coordinator handles integration and release review.

## Product and acceptance
A volunteer submits synthetic text, photo and location from a phone in under two minutes. Staff see colony census, fixed/TNR/unknown status, vet-review needs, last confirmed feeding and urgent reports. Two distinct photographs of the same cat must support human-confirmed identity linking so that one canonical cat is counted once. Exact duplicate files alone do not satisfy this requirement. Humans confirm merges and adopted/missing changes. Only intentional submissions and synthetic chat exports are permitted. No live WhatsApp access.

Use synthetic data only. Preserve original report evidence. Distinguish reporter statements, model suggestions and confirmed facts. An urgent report must be visible before identity review finishes. “No feeding recorded” is not proof nobody fed the colony. A photo/report is not proof of a completed feeding visit. TNR unknown is separate from confirmed not fixed. No diagnoses or treatment instructions.

## Integration architecture
TypeScript ESM. One Node application serving API and eventually UI. SQLite for local development, with database access behind services. Local SQLite is not a durable database on Vercel Functions: cloud persistence and private image storage are integration decisions to settle before deployment. No cloud provider provisioning in individual lanes.
One bounded Agents SDK runtime; multiple development workers do not imply multiple runtime agents. Server owns permissions and state. API invokes the agent; agent reads scoped context and returns typed proposals. Backend applies approved changes transactionally.

## Contracts
IDs are opaque strings; dates ISO 8601 UTC. Actor: {id, role: "staff"|"volunteer", assignedColonyIds:string[]}. Actor comes from server session, never request JSON.
ReportInput: {clientRequestId, text, selectedColonyId?:string, mediaIds:string[], demoLocationId?:string, observedAt?:string}.
Report status: received|processing|needs_review|completed|failed.
Agent proposal: {reportId, colonyCandidates:[{colonyId,evidenceIds,reasons}], catCandidates:[{catId,evidenceIds,reasons,contradictions}], observations:[{kind,statement,source:"reporter"|"visual",evidenceIds}], urgency:{level:"routine"|"watch"|"same_day_review",reasons,evidenceIds}, uncertainties:string[]}.
No fabricated percentage confidence. Null/unknown when evidence is absent. Server validates referenced IDs and scope.
Review: {id,reportId,action:"link_observation"|"confirm_new_cat"|"merge_cats"|"mark_adopted"|"mark_missing",status:"pending"|"approved"|"rejected",version,proposedChange,evidenceIds}.
Decision input: {decision:"approve"|"reject",expectedVersion,reason}. Exact reviewed proposal is frozen; reject stale versions.
Error envelope: {error:{code,message,requestId}}; success {data:...}. Use 400 validation, 401 session missing, 403 denied, 404 missing, 409 conflict, 503 dependency unavailable.

## Ownership and Git
Read current repository and preserve teammates' work. Each member uses their specified codex/ branch. Submit a focused PR to main, never force-push or merge it yourself. Do not edit another lane's files; request a contract change through PR notes. Shared contracts belong to API integrator, schema to backend data owner. Use temporary adapters inside your own lane until dependencies land; label stubs honestly.
Never commit .env, credentials, local databases or uploads. Do not read or print another user's secrets. Avoid unrelated package upgrades. Propose dependency changes in PR notes so the coordinator can reconcile package/lockfile edits.

## Definition of done
Runnable code, meaningful lane tests, documented exports and examples, known limitations, exact commands and results, and a focused PR. No fake success receipts, no fixture presented as live inference, no UI-only authorization. No production security/compliance claims.
