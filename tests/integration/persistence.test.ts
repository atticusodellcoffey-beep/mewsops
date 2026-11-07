import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDatabase, migrate, seedDemo } from "../../src/db/index.js";
import { createServices } from "../../src/domain/index.js";
import {
  DomainError,
  type Actor,
  type AgentProposal,
} from "../../src/domain/types.js";
import { demoProposal, demoReport } from "../../scripts/demo-scenario.js";

describe("persisted backend integration", () => {
  let directory: string;
  let db: ReturnType<typeof createDatabase>;
  let services: ReturnType<typeof createServices>;
  let volunteer: Actor;
  let staff: Actor;
  let colonyId: string;
  let catId: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "mewsops-integration-"));
    db = createDatabase(join(directory, "demo.db"));
    migrate(db);
    seedDemo(db);
    services = createServices(db);
    const row = db
      .prepare(
        `SELECT u.id AS actorId, a.colony_id AS colonyId, c.id AS catId
      FROM users u JOIN colony_assignments a ON a.user_id=u.id JOIN cats c ON c.colony_id=a.colony_id
      WHERE u.role='volunteer' AND c.identity_confirmed=1 AND c.lifecycle='active'
      ORDER BY u.id,c.id LIMIT 1`,
      )
      .get() as { actorId: string; colonyId: string; catId: string };
    colonyId = row.colonyId;
    catId = row.catId;
    volunteer = {
      id: row.actorId,
      role: "volunteer",
      assignedColonyIds: [colonyId],
    };
    staff = { id: "user-1", role: "staff", assignedColonyIds: [] };
  });

  afterEach(() => {
    if (db?.open) db.close();
    rmSync(directory, { recursive: true, force: true });
  });

  function submitAndPropose(key: string) {
    const input = demoReport(colonyId, key);
    services.submitReport(volunteer, input);
    const report = db
      .prepare(
        "SELECT id FROM reports WHERE actor_id=? AND client_request_id=?",
      )
      .get(volunteer.id, key) as { id: string };
    services.applyAgentProposal(
      staff,
      demoProposal(report.id, colonyId, catId, [report.id]),
    );
    const review = services
      .listReviews(staff)
      .find(
        (item) =>
          item.reportId === report.id && item.action === "link_observation",
      );
    expect(review).toBeDefined();
    return { input, reportId: report.id, review: review! };
  }

  it("preserves ingestion and approval receipts across a database close/reopen", () => {
    const { input, reportId, review } = submitAndPropose("restart-receipt");
    const decision = {
      decision: "approve" as const,
      expectedVersion: review.version,
      reason: "Synthetic staff confirmation.",
    };
    const receipt = services.decideReview(staff, review.id, decision);
    const auditCount = (
      db.prepare("SELECT count(*) AS n FROM audit_events").get() as {
        n: number;
      }
    ).n;
    db.close();
    db = createDatabase(join(directory, "demo.db"));
    migrate(db);
    services = createServices(db);
    services.submitReport(volunteer, input);
    expect(services.decideReview(staff, review.id, decision)).toEqual(receipt);
    expect(
      (
        db
          .prepare("SELECT count(*) AS n FROM reports WHERE id=?")
          .get(reportId) as { n: number }
      ).n,
    ).toBe(1);
    expect(
      (
        db.prepare("SELECT count(*) AS n FROM audit_events").get() as {
          n: number;
        }
      ).n,
    ).toBe(auditCount);
    expect(() =>
      services.decideReview(staff, review.id, {
        ...decision,
        decision: "reject",
      }),
    ).toThrow();
  });

  it("rolls back the identity link and review decision when audit storage fails", () => {
    const { reportId, review } = submitAndPropose("rollback-on-audit");
    const before = db
      .prepare("SELECT cat_id FROM observations WHERE report_id=? ORDER BY id")
      .all(reportId);
    db.exec(
      "CREATE TRIGGER test_audit_failure BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT, 'injected audit failure'); END;",
    );
    expect(() =>
      services.decideReview(staff, review.id, {
        decision: "approve",
        expectedVersion: review.version,
        reason: "Synthetic staff confirmation.",
      }),
    ).toThrow();
    expect(
      db
        .prepare("SELECT status, version FROM review_requests WHERE id=?")
        .get(review.id),
    ).toEqual({ status: "pending", version: review.version });
    expect(
      db
        .prepare(
          "SELECT cat_id FROM observations WHERE report_id=? ORDER BY id",
        )
        .all(reportId),
    ).toEqual(before);
  });

  it("rejects malformed model output while retaining the original urgent report", () => {
    const input = demoReport(colonyId, "invalid-model-output");
    services.submitReport(volunteer, input);
    const report = db
      .prepare(
        "SELECT id FROM reports WHERE actor_id=? AND client_request_id=?",
      )
      .get(volunteer.id, input.clientRequestId) as { id: string };
    const proposal = demoProposal(report.id, colonyId, catId, [report.id]);
    for (const invalid of [
      null,
      {
        ...proposal,
        urgency: { ...proposal.urgency, reasons: "not-an-array" },
      },
    ]) {
      expect(() =>
        services.applyAgentProposal(staff, invalid as unknown as AgentProposal),
      ).toThrow(DomainError);
    }
    expect(
      db
        .prepare("SELECT id FROM observations WHERE report_id=?")
        .all(report.id),
    ).toHaveLength(0);
    expect(
      services
        .listAlerts(staff)
        .some(
          (alert) =>
            alert.reportId === report.id && alert.level === "same_day_review",
        ),
    ).toBe(true);
    expect(services.getReport(volunteer, report.id).text).toBe(input.text);
  });

  it("confirms two distinct synthetic image references as one existing identity without inflating census", () => {
    const before = services.getColonySummary(staff, "colony-1");
    const review = services
      .listReviews(staff)
      .find((item) => item.id === "review-1")!;
    expect(review.evidenceIds).toEqual(["media-1", "media-2"]);
    services.decideReview(staff, review.id, {
      decision: "approve",
      expectedVersion: review.version,
      reason:
        "Synthetic identity test: staff confirms both observations as Pebble.",
    });
    expect(services.getColonySummary(staff, "colony-1").confirmedCats).toBe(
      before.confirmedCats,
    );
    const observations = services.getReport(staff, "report-1").observations;
    expect(observations).toHaveLength(2);
    expect(
      observations.every((observation) => observation.catId === "cat-1"),
    ).toBe(true);
    expect(
      services.getColonySummary(staff, "colony-1").pendingObservations,
    ).toBe(0);
  });
});
