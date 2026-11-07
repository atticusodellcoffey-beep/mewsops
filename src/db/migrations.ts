import type { Db } from "./types.js";
export const schemaV1 = `
CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('staff','volunteer')), available INTEGER NOT NULL DEFAULT 1 CHECK(available IN (0,1)));
CREATE TABLE colonies (id TEXT PRIMARY KEY, name TEXT NOT NULL, location_label TEXT NOT NULL, exact_location TEXT);
CREATE TABLE colony_assignments (user_id TEXT NOT NULL REFERENCES users(id), colony_id TEXT NOT NULL REFERENCES colonies(id), PRIMARY KEY(user_id,colony_id));
CREATE TABLE cats (id TEXT PRIMARY KEY, colony_id TEXT NOT NULL REFERENCES colonies(id), name TEXT NOT NULL, lifecycle TEXT NOT NULL DEFAULT 'active' CHECK(lifecycle IN ('active','adopted','missing')), sterilization TEXT NOT NULL DEFAULT 'unknown' CHECK(sterilization IN ('unknown','fixed','not_fixed')), identity_confirmed INTEGER NOT NULL DEFAULT 0 CHECK(identity_confirmed IN (0,1)), vet_review_status TEXT NOT NULL DEFAULT 'none' CHECK(vet_review_status IN ('none','needed','reviewed')), created_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version>0));
CREATE TABLE reports (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES users(id), client_request_id TEXT NOT NULL, text TEXT NOT NULL, selected_colony_id TEXT REFERENCES colonies(id), demo_location_id TEXT, observed_at TEXT, received_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'received' CHECK(status IN ('received','processing','needs_review','completed','failed')), UNIQUE(actor_id,client_request_id));
CREATE TABLE media (id TEXT PRIMARY KEY, report_id TEXT REFERENCES reports(id), uploaded_by TEXT NOT NULL REFERENCES users(id), storage_ref TEXT NOT NULL, sha256 TEXT, available INTEGER NOT NULL DEFAULT 0 CHECK(available IN (0,1)), created_at TEXT NOT NULL);
CREATE TABLE observations (id TEXT PRIMARY KEY, report_id TEXT NOT NULL REFERENCES reports(id), cat_id TEXT REFERENCES cats(id), kind TEXT NOT NULL, statement TEXT NOT NULL, source TEXT NOT NULL CHECK(source IN ('reporter','visual','confirmed')), evidence_ids TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(evidence_ids)), observed_at TEXT, created_at TEXT NOT NULL);
CREATE TABLE feeding_visits (id TEXT PRIMARY KEY, colony_id TEXT NOT NULL REFERENCES colonies(id), feeder_id TEXT NOT NULL REFERENCES users(id), report_id TEXT REFERENCES reports(id), occurred_at TEXT NOT NULL, recorded_at TEXT NOT NULL, confirmed_by TEXT NOT NULL REFERENCES users(id), client_request_id TEXT NOT NULL, evidence TEXT NOT NULL, UNIQUE(feeder_id,client_request_id));
CREATE TABLE alerts (id TEXT PRIMARY KEY, report_id TEXT NOT NULL REFERENCES reports(id), colony_id TEXT REFERENCES colonies(id), level TEXT NOT NULL CHECK(level IN ('routine','watch','same_day_review')), reasons TEXT NOT NULL CHECK(json_valid(reasons)), evidence_ids TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(evidence_ids)), status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')), created_at TEXT NOT NULL);
CREATE UNIQUE INDEX one_active_alert_per_report ON alerts(report_id) WHERE status='open';
CREATE TABLE review_requests (id TEXT PRIMARY KEY, report_id TEXT NOT NULL REFERENCES reports(id), action TEXT NOT NULL CHECK(action IN ('link_observation','confirm_new_cat','merge_cats','mark_adopted','mark_missing')), status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')), version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), proposed_change TEXT NOT NULL CHECK(json_valid(proposed_change)), evidence_ids TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(evidence_ids)), created_at TEXT NOT NULL, decided_by TEXT REFERENCES users(id), decided_at TEXT, decision_reason TEXT, target_snapshot TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(target_snapshot)), receipt TEXT CHECK(receipt IS NULL OR json_valid(receipt)));
CREATE TABLE audit_events (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, before_json TEXT CHECK(before_json IS NULL OR json_valid(before_json)), after_json TEXT CHECK(after_json IS NULL OR json_valid(after_json)), reason TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE merge_aliases (id TEXT PRIMARY KEY, alias_cat_id TEXT NOT NULL REFERENCES cats(id), canonical_cat_id TEXT NOT NULL REFERENCES cats(id), created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, reversed_by TEXT REFERENCES users(id), reversed_at TEXT, reason TEXT NOT NULL, review_id TEXT REFERENCES review_requests(id), snapshot TEXT CHECK(snapshot IS NULL OR json_valid(snapshot)), after_version INTEGER, CHECK(alias_cat_id<>canonical_cat_id), CHECK((reversed_at IS NULL)=(reversed_by IS NULL)));
CREATE TABLE proposal_receipts (id TEXT PRIMARY KEY, report_id TEXT NOT NULL UNIQUE REFERENCES reports(id), payload_hash TEXT NOT NULL, review_ids TEXT NOT NULL CHECK(json_valid(review_ids)), result_json TEXT NOT NULL CHECK(json_valid(result_json)), created_at TEXT NOT NULL);
CREATE UNIQUE INDEX one_active_alias ON merge_aliases(alias_cat_id) WHERE reversed_at IS NULL;
CREATE INDEX observations_cat ON observations(cat_id);
CREATE INDEX reports_colony ON reports(selected_colony_id);
CREATE INDEX media_hash ON media(sha256);
CREATE INDEX review_pending ON review_requests(status);
CREATE INDEX feeding_colony_time ON feeding_visits(colony_id,occurred_at);
CREATE TRIGGER immutable_report_evidence BEFORE UPDATE OF text,actor_id,client_request_id,selected_colony_id,demo_location_id,observed_at,received_at ON reports BEGIN SELECT RAISE(ABORT,'Original report evidence is immutable'); END;
CREATE TRIGGER immutable_observation_evidence BEFORE UPDATE OF report_id,kind,statement,source,evidence_ids,observed_at,created_at ON observations BEGIN SELECT RAISE(ABORT,'Original observation evidence is immutable'); END;
CREATE TRIGGER immutable_review_proposal BEFORE UPDATE OF report_id,action,proposed_change,evidence_ids,target_snapshot ON review_requests BEGIN SELECT RAISE(ABORT,'Review proposal is frozen'); END;
CREATE TRIGGER no_audit_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT,'Audit events are append only'); END;
CREATE TRIGGER no_audit_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT,'Audit events are append only'); END;
`;
export function migrate(db: Db): void {
  const verifyIntegrity = () => {
    if (db.pragma("foreign_keys", { simple: true }) !== 1)
      throw new Error("Database integrity failure: foreign keys are disabled");
    const requiredTriggers: Record<string, string[]> = {
      immutable_report_evidence: ["BEFORE UPDATE OF", "reports", "RAISE(ABORT"],
      immutable_observation_evidence: ["BEFORE UPDATE OF", "observations", "RAISE(ABORT"],
      immutable_review_proposal: ["BEFORE UPDATE OF", "review_requests", "RAISE(ABORT"],
      no_audit_update: ["BEFORE UPDATE", "audit_events", "RAISE(ABORT"],
      no_audit_delete: ["BEFORE DELETE", "audit_events", "RAISE(ABORT"],
    };
    for (const [name, fragments] of Object.entries(requiredTriggers)) {
      const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name=?").get(name) as { sql: string } | undefined;
      if (!row || fragments.some((fragment) => !row.sql.toUpperCase().includes(fragment.toUpperCase())))
        throw new Error(`Incompatible schema: missing or altered trigger ${name}`);
    }
    const requiredIndexes: Record<string, string> = {
      one_active_alias: "WHERE reversed_at IS NULL",
      one_active_alert_per_report: "WHERE status='open'",
    };
    for (const [name, predicate] of Object.entries(requiredIndexes)) {
      const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name=?").get(name) as { sql: string } | undefined;
      if (!row || !row.sql.replace(/\\s+/g, "").toUpperCase().includes(predicate.replace(/\\s+/g, "").toUpperCase()))
        throw new Error(`Incompatible schema: missing or altered index ${name}`);
    }
    const integrity = db.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
    if (integrity.integrity_check !== "ok") throw new Error("Database integrity check failed");
  };
  db.transaction(() => {
    db.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)",
    );
    const versions = db
      .prepare("SELECT version FROM schema_migrations")
      .all() as { version: number }[];
    if (versions.some((v) => v.version > 1))
      throw new Error("Database schema is newer than this application");
    if (versions.some((v) => v.version === 1)) {
      const required: Record<string, string[]> = {
        users: ["id", "role"],
        colonies: ["id", "name"],
        colony_assignments: ["user_id", "colony_id"],
        cats: ["version"],
        reports: ["id", "actor_id", "client_request_id"],
        media: ["id", "uploaded_by"],
        observations: ["id", "report_id", "evidence_ids"],
        feeding_visits: ["client_request_id", "evidence"],
        alerts: ["report_id", "level", "status", "evidence_ids"],
        review_requests: ["target_snapshot", "receipt"],
        merge_aliases: ["review_id", "snapshot", "after_version"],
        proposal_receipts: [
          "report_id",
          "payload_hash",
          "review_ids",
          "result_json",
        ],
      };
      for (const [table, columns] of Object.entries(required)) {
        const present = new Set(
          (
            db.prepare(`PRAGMA table_info(${table})`).all() as {
              name: string;
            }[]
          ).map((c) => c.name),
        );
        if (columns.some((c) => !present.has(c)))
          throw new Error(
            "Incompatible pre-release schema v1. Preserve non-demo data; for marked demo databases run demo-reset -- --confirm-demo-reset.",
          );
      }
      for (const [name, sql] of Object.entries({
        one_active_alias:
          "SELECT 1 FROM sqlite_master WHERE type='index' AND name='one_active_alias'",
        one_active_alert_per_report:
          "SELECT 1 FROM sqlite_master WHERE type='index' AND name='one_active_alert_per_report'",
      }))
        if (!db.prepare(sql).get())
          throw new Error(
            `Incompatible pre-release schema v1: missing ${name}`,
          );
    }
    if (!versions.some((v) => v.version === 1)) {
      db.exec(schemaV1);
      db.prepare("INSERT INTO schema_migrations VALUES (?,?)").run(
        1,
        "2026-11-07T00:00:00.000Z",
      );
    }
    verifyIntegrity();
  }).immediate();
}
