import { describe, it, expect } from "vitest";
import {
  createDatabase,
  migrate,
  seedDemo,
  repositories,
} from "../../src/db/index.js";
import { resetDemo } from "../../scripts/demo-reset.js";
function fresh() {
  const db = createDatabase(":memory:");
  migrate(db);
  seedDemo(db);
  return db;
}
describe("real SQLite database", () => {
  it("rejects an incompatible earlier development schema without changing it", () => {
    const db = createDatabase(":memory:");
    try {
      db.exec(
        "CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT); INSERT INTO schema_migrations VALUES(1,'earlier'); CREATE TABLE cats(id TEXT PRIMARY KEY);",
      );
      expect(() => migrate(db)).toThrow("Incompatible pre-release");
      expect(db.prepare("PRAGMA table_info(cats)").all()).toHaveLength(1);
    } finally {
      db.close();
    }
  });
  it("migrates twice, enforces foreign keys and deterministic idempotent seed", () => {
    const a = fresh(),
      b = fresh();
    try {
      migrate(a);
      seedDemo(a);
      expect(a.pragma("foreign_keys", { simple: true })).toBe(1);
      for (const table of [
        "users",
        "colonies",
        "cats",
        "reports",
        "observations",
        "alerts",
      ])
        expect(a.prepare(`SELECT * FROM ${table} ORDER BY id`).all()).toEqual(
          b.prepare(`SELECT * FROM ${table} ORDER BY id`).all(),
        );
      expect(repositories(a).users.list()).toHaveLength(20);
      expect(repositories(a).colonies.list()).toHaveLength(18);
      expect(repositories(a).cats.list()).toHaveLength(12);
      a.prepare("UPDATE cats SET name='Edited' WHERE id='cat-1'").run();
      seedDemo(a);
      expect(repositories(a).cats.get("cat-1")?.name).toBe("Edited");
      expect(() =>
        a
          .prepare(
            "INSERT INTO colony_assignments VALUES ('absent','colony-1')",
          )
          .run(),
      ).toThrow();
    } finally {
      a.close();
      b.close();
    }
  });
  it("enforces actor-scoped ingestion uniqueness and immutable evidence", () => {
    const db = fresh();
    try {
      const r = repositories(db),
        report = r.reports.get("report-1")!;
      expect(() => r.reports.insert({ ...report, id: "duplicate" })).toThrow();
      r.reports.insert({ ...report, id: "other-actor", actor_id: "user-4" });
      expect(() =>
        db
          .prepare("UPDATE reports SET text='changed' WHERE id='report-1'")
          .run(),
      ).toThrow();
      expect(() =>
        db
          .prepare(
            "UPDATE review_requests SET target_snapshot='[]' WHERE id='review-1'",
          )
          .run(),
      ).toThrow();
    } finally {
      db.close();
    }
  });
  it("counts canonical cats, preserves evidence through merge and reversal, rejects chains", () => {
    const db = fresh();
    try {
      const r = repositories(db);
      db.prepare(
        "UPDATE observations SET cat_id='cat-1' WHERE id='observation-1'",
      ).run();
      const before = r.observations.list();
      const count = r.cats.countByColony("colony-1").confirmed;
      r.merges.merge({
        id: "merge-test",
        aliasCatId: "cat-1",
        canonicalCatId: "cat-2",
        actorId: "user-1",
        reason: "Human comparison",
        at: "2026-11-07T13:00:00.000Z",
      });
      expect(r.cats.canonicalId("cat-1")).toBe("cat-2");
      expect(r.cats.countByColony("colony-1").confirmed).toBe(count - 1);
      expect(r.observations.list()).toEqual(before);
      expect(() =>
        r.merges.merge({
          id: "chain",
          aliasCatId: "cat-2",
          canonicalCatId: "cat-3",
          actorId: "user-1",
          reason: "test",
          at: "2026-11-07T13:00:00.000Z",
        }),
      ).toThrow();
      r.merges.reverse({
        id: "reverse-test",
        aliasCatId: "cat-1",
        actorId: "user-1",
        reason: "Lookalike correction",
        at: "2026-11-07T14:00:00.000Z",
      });
      expect(r.cats.countByColony("colony-1").confirmed).toBe(count);
      expect(r.observations.list()).toEqual(before);
      expect(r.audit_events.list()).toHaveLength(2);
    } finally {
      db.close();
    }
  });
  it("rolls back a failed transaction and preserves unaudited merge state", () => {
    const db = fresh();
    try {
      const r = repositories(db);
      expect(() =>
        r.transaction(() => {
          db.prepare("UPDATE cats SET name='bad' WHERE id='cat-1'").run();
          throw new Error("abort");
        }),
      ).toThrow();
      expect(r.cats.get("cat-1")?.name).toBe("Pebble");
      expect(() =>
        r.merges.merge({
          id: "bad",
          aliasCatId: "cat-1",
          canonicalCatId: "cat-2",
          actorId: "user-3",
          reason: "bad",
          at: "2026-11-07T13:00:00.000Z",
        }),
      ).toThrow();
      expect(r.merge_aliases.list()).toHaveLength(0);
    } finally {
      db.close();
    }
  });
  it("refuses reset without exact confirmation or with arbitrary paths", () => {
    expect(() => resetDemo([])).toThrow();
    expect(() =>
      resetDemo(["--confirm-demo-reset", "/tmp/other.db"]),
    ).toThrow();
  });
});
