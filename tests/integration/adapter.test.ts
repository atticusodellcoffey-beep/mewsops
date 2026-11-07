import { describe, expect, it } from "vitest";
import {
  createDatabase,
  migrate,
  seedDemo,
  repositories,
} from "../../src/db/index.js";
import { createSqlitePort } from "../../src/domain/sqlite.js";

describe("relational adapter review fixes", () => {
  it("persists a review scope when the original report has no selected colony", () => {
    const db = createDatabase(":memory:");
    try {
      migrate(db);
      seedDemo(db);
      const repo = repositories(db);
      repo.reports.insert({
        ...repo.reports.get("report-1")!,
        id: "unassigned-report",
        client_request_id: "unassigned-report",
        selected_colony_id: null,
      });
      const port = createSqlitePort(db);
      port.put("reviews", {
        id: "scoped-review",
        reportId: "unassigned-report",
        colonyId: "colony-1",
        action: "link_observation",
        status: "pending",
        version: 1,
        proposedChange: { catId: "cat-1" },
        evidenceIds: ["unassigned-report"],
        targetSnapshot: [],
      });
      expect(
        createSqlitePort(db).get("reviews", "scoped-review")?.colonyId,
      ).toBe("colony-1");
      expect(() =>
        port.put("reviews", {
          id: "wrong-scope",
          reportId: "unassigned-report",
          colonyId: "colony-1",
          action: "link_observation",
          status: "pending",
          version: 1,
          proposedChange: { colonyId: "colony-2" },
          evidenceIds: [],
          targetSnapshot: [],
        }),
      ).toThrow("scope mismatch");
    } finally {
      db.close();
    }
  });

  it("preserves alert resolution and evidence instead of presenting every row as open", () => {
    const db = createDatabase(":memory:");
    try {
      migrate(db);
      seedDemo(db);
      db.prepare(
        "UPDATE alerts SET status='resolved' WHERE id='alert-1'",
      ).run();
      const alert = createSqlitePort(db).get("alerts", "alert-1");
      expect(alert?.status).toBe("resolved");
      expect(alert?.evidenceIds).toEqual(["report-1"]);
    } finally {
      db.close();
    }
  });
});
