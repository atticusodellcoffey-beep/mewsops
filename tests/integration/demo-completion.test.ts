import { describe, expect, it } from "vitest";
import { createDatabase, migrate, seedDemo } from "../../src/db/index.js";
import { createServices } from "../../src/domain/index.js";

describe("demo staff workflows", () => {
  it("requires a colony for staff reports", () => {
    const db = createDatabase(":memory:");
    try { migrate(db); seedDemo(db); const s = createServices(db);
      expect(() => s.submitReport({id:"user-1",role:"staff",assignedColonyIds:[]}, {clientRequestId:"no-colony",text:"Report",mediaIds:[]})).toThrow();
    } finally { db.close(); }
  });
  it("resolves alerts and corrects a linked observation with staff-only audited changes", () => {
    const db = createDatabase(":memory:");
    try {
      migrate(db); seedDemo(db); const s = createServices(db);
      const staff = {id:"user-1",role:"staff" as const,assignedColonyIds:[]};
      const volunteer = {id:"user-3",role:"volunteer" as const,assignedColonyIds:["colony-1"]};
      expect(() => s.resolveAlert(volunteer,"alert-1","Handled")).toThrow();
      s.resolveAlert(staff,"alert-1","Handled by staff");
      expect(s.listAlerts(staff).some(a => a.id === "alert-1")).toBe(false);
      expect(() => s.resolveAlert(staff,"alert-1","Repeat")).toThrow();
      s.decideReview(staff,"review-1",{decision:"approve",expectedVersion:1,reason:"Initial link",selectedCatId:"cat-1"});
      expect(() => s.correctObservationLink(volunteer,"observation-1","Wrong cat")).toThrow();
      s.correctObservationLink(staff,"observation-1","Wrong cat; needs another review");
      expect(db.prepare("SELECT cat_id FROM observations WHERE id=?").get("observation-1")).toEqual({cat_id:null});
      expect(s.getReport(staff,"report-1").status).toBe("needs_review");
      expect(db.prepare("SELECT action FROM audit_events WHERE action IN ('resolve_alert','correct_observation_link') ORDER BY action").all()).toEqual([{action:"correct_observation_link"},{action:"resolve_alert"}]);
    } finally { db.close(); }
  });
});
