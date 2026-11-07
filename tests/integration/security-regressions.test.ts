import { describe, expect, it } from "vitest";
import { createDatabase, migrate, seedDemo } from "../../src/db/index.js";
import { createServices } from "../../src/domain/index.js";

describe("security regressions", () => {
  it("does not permit a staff decision to substitute an unfrozen cat", () => {
    const db = createDatabase(":memory:");
    try {
      migrate(db); seedDemo(db);
      const service = createServices(db);
      const staff = { id: "user-1", role: "staff" as const, assignedColonyIds: [] };
      expect(() => service.decideReview(staff, "review-1", {decision:"approve",expectedVersion:1,reason:"Confirm",selectedCatId:"cat-2"})).toThrow();
      expect(db.prepare("SELECT status FROM review_requests WHERE id='review-1'").get()).toEqual({status:"pending"});
      expect(db.prepare("SELECT cat_id FROM observations WHERE id='observation-1'").get()).toEqual({cat_id:null});
    } finally { db.close(); }
  });
  it.each([
    ["missing trigger", "DROP TRIGGER no_audit_delete"],
    ["disabled trigger", "DROP TRIGGER no_audit_delete; CREATE TRIGGER no_audit_delete BEFORE DELETE ON audit_events WHEN 0 BEGIN SELECT RAISE(ABORT,'Audit events are append only'); END"],
    ["weakened index", "DROP INDEX one_active_alias; CREATE INDEX one_active_alias ON merge_aliases(canonical_cat_id) WHERE reversed_at IS NULL"],
    ["extra trigger", "CREATE TRIGGER unexpected AFTER INSERT ON reports BEGIN DELETE FROM audit_events; END"],
    ["temporary trigger", "CREATE TEMP TRIGGER sneaky BEFORE INSERT ON audit_events BEGIN SELECT RAISE(IGNORE); END"],
  ])("rejects %s", (_name, sql) => {
    const db = createDatabase(":memory:");
    try { migrate(db); db.exec(sql); expect(() => migrate(db)).toThrow(/altered|missing|unexpected/i); } finally { db.close(); }
  });
  it("rejects existing orphaned records and disabled foreign keys", () => {
    const db = createDatabase(":memory:");
    try {
      migrate(db); db.pragma("foreign_keys = OFF");
      db.prepare("INSERT INTO colony_assignments VALUES (?,?)").run("missing-user", "missing-colony");
      expect(() => migrate(db)).toThrow(/foreign keys are disabled/i);
      db.pragma("foreign_keys = ON");
      expect(() => migrate(db)).toThrow(/foreign-key violations/i);
    } finally { db.close(); }
  });
  it("prevents audit replacement through SQLite REPLACE", () => {
    const db = createDatabase(":memory:");
    try {
      migrate(db); seedDemo(db);
      const insert = db.prepare("INSERT INTO audit_events (id,actor_id,action,entity_type,entity_id,reason,created_at) VALUES ('test-audit','user-1','original','cat','cat-1','test','2026-11-07T12:00:00.000Z')");
      insert.run();
      expect(() => db.prepare("INSERT OR REPLACE INTO audit_events (id,actor_id,action,entity_type,entity_id,reason,created_at) VALUES ('test-audit','user-1','changed','cat','cat-1','test','2026-11-07T12:00:00.000Z')").run()).toThrow();
      expect(db.prepare("SELECT action FROM audit_events WHERE id='test-audit'").get()).toEqual({action:"original"});
    } finally { db.close(); }
  });
});
