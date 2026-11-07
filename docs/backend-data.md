# Backend data contract (live handoff)

Exports from `src/db/index.ts`: `createDatabase(path): Db`, `migrate(db): void`, `seedDemo(db): void`, `repositories(db)`, `DEMO_DATABASE_PATH` (absolute project `storage/mewsops-demo.db`). Db is a synchronous better-sqlite3 Database; close with db.close(). Parent owns dependency/package changes; existing better-sqlite3 is sufficient.

Actual frozen SQL: `src/db/migrations.ts`; exact snake_case row types: `src/db/types.ts`. Domain owns the relational adapter to its camelCase DomainPort; there is no separate runtime store. Use db.transaction(work).immediate() for decision + mutation + audit. Callbacks must be synchronous.

Additive contract coordinated with domain: cats.version INTEGER default 1. feeding_visits.client_request_id TEXT NOT NULL and evidence TEXT NOT NULL; unique(feeder_id,client_request_id). review_requests.target_snapshot JSON array default [], receipt nullable JSON. Frozen target_snapshot and proposed_change cannot be updated. merge_aliases.review_id nullable FK, snapshot nullable JSON, after_version nullable INTEGER. Reverse sets reversed_by + reversed_at; never delete alias history. Source observations retain original cat_id. Domain derives canonicalId from active aliases and increments cats.version. Domain adapter must preserve evidence/proposal fields on updates (SQLite triggers reject UPDATE OF protected columns even if unchanged).

Reports have actor-scoped client_request_id uniqueness. Separate observed_at/received_at; feeding occurred_at/recorded_at. Reports original text is immutable. Review decision fields mutable, proposals frozen. Foreign keys enabled per connection. Dates are ISO UTC supplied by caller.

Repository contract: each named table has get(id), list(), insert(row). assignments has listForUser(userId), assign(userId,colonyId). cats additionally canonicalId(id), countByColony(colonyId). merges.merge/reverse accept {id,aliasCatId,actorId,reason,at}, merge also canonicalCatId. These low-level helpers verify staff and transact mutation+audit; domain review approval gate remains in service. Raw SQL available for service transactions.

Reset: only `scripts/demo-reset.ts --confirm-demo-reset` allowed; no custom path. Seed is insert-once transactional and does not overwrite edited demo state. Image references are placeholders marked available=0, not existing assets.

## Schema dictionary

| Table | Purpose and constraints |
|---|---|
| users | Fictional display name, staff/volunteer role, availability flag |
| colonies | Public zone label and staff-only exact_location; repositories do not perform privacy filtering |
| colony_assignments | Composite user_id/colony_id primary key and foreign keys |
| cats | Independent lifecycle, sterilization, identity_confirmed, vet_review_status, optimistic version |
| reports | Immutable original intake, actor-scoped request key, occurrence and receipt timestamps |
| media | Owner, optional report, storage reference, nullable hash, available flag; hashes are not unique because duplicate evidence is retained |
| observations | Immutable statement/source/evidence, mutable human-confirmed cat link; merge never rewrites this link |
| feeding_visits | Confirmed explicit visit, occurrence/recording times, feeder-scoped idempotency key, free-text evidence |
| alerts | Report/colony scope, urgency, JSON reasons/evidence IDs, open/resolved status |
| review_requests | Frozen action/proposal/evidence/target_snapshot; mutable decision/version/receipt |
| audit_events | Append-only before/after JSON, actor, reason and timestamp |
| merge_aliases | Original and canonical IDs, actor/time/reason, optional review/snapshot/version, reversal actor/time; unique active alias |
| schema_migrations | Applied schema version; future versions refused |
| demo_seed | Insert-once synthetic fixture marker |

JSON columns are serialized JSON strings, validated by SQLite. JSON referenced IDs and semantic UTC date validation are service responsibilities. No percentage confidence, automatic status changes, or diagnosis. Counts include only active canonical cats, distinguishing confirmed/pending and unknown/fixed/not_fixed. An adopted/missing canonical cat is excluded. Observations and photos never increment the count.

## Example

```ts
import { createDatabase, migrate, seedDemo, repositories, DEMO_DATABASE_PATH } from './src/db/index.js';
const db = createDatabase(DEMO_DATABASE_PATH);
try {
  migrate(db);
  seedDemo(db); // safe rerun; leaves staff edits intact
  const repo = repositories(db);
  console.log(repo.cats.countByColony('colony-1'));
  repo.transaction(() => {
    // service-authorized mutations and corresponding audit insert go here
  });
} finally { db.close(); }
```

createDatabase creates the storage directory only for DEMO_DATABASE_PATH. Other paths require an existing parent directory. Repositories are an internal persistence boundary, not HTTP authorization. Low-level merge helpers require a staff actor but do not substitute for the domain's review approval checks. Chains/cycles are refused by the merge helper; callers using raw SQL must maintain that invariant. The canonical resolver detects corrupted cycles and fails rather than hanging.

## Demo and verification

The seed has 18 colonies, 20 users, 12 cat records (11 confirmed), three reports, three alerts, two absent synthetic image references, a pending link review, unconfirmed kitten evidence, unknown TNR, lookalikes, and a stale confirmed feeding visit by an unavailable feeder. IDs are stable. User-3/4/5 are assigned to report colonies 1/2/3. Seed snapshots use the domain camelCase Cat representation.

Run `npm run demo-reset -- --confirm-demo-reset`. Stop other demo writers first. Reset refuses custom arguments, symlink/hardlink paths, an existing database without the seed marker, and unknown tables. It resets tables and seeds in one SQLite transaction, without deleting files. No changes to unrelated files; failures roll back schema/data. Filesystem symlink checks protect ordinary misuse, not hostile concurrent filesystem races.

Verification: `npx vitest run tests/db` — 8 tests pass (fresh/rerun migrations and incompatible pre-release schema refusal, foreign keys, deterministic/idempotent seed, actor-scoped uniqueness, evidence protection, counts, merge/reversal/chain refusal, authorization, rollback, actual reset and non-demo/symlink refusal). The coordinator runs the complete project typecheck and integration suite after both lanes land; see `docs/backend-verification.md` for final results.

Isolated lane typecheck passed: `npx tsc --ignoreConfig --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --esModuleInterop --skipLibCheck src/db/index.ts scripts/demo-reset.ts`. Earlier pre-release v1 databases lacking finalized columns are rejected explicitly with reset guidance; migrate never silently destroys existing data. A production migration from any previously deployed schema is not claimed (this is the first unreleased schema).
