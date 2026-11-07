import { beforeEach, afterEach, expect, test } from "vitest";
import {
  createDatabase,
  migrate,
  seedDemo,
  type Db,
} from "../../src/db/index.js";
import {
  createServices,
  type Actor,
  type AgentProposal,
} from "../../src/domain/index.js";
let db: Db, s: ReturnType<typeof createServices>;
const staff: Actor = { id: "user-1", role: "staff", assignedColonyIds: [] };
const otherStaff: Actor = { ...staff, id: "user-2" };
const vol: Actor = {
  id: "user-3",
  role: "volunteer",
  assignedColonyIds: ["colony-1"],
};
const other: Actor = {
  id: "user-6",
  role: "volunteer",
  assignedColonyIds: ["colony-1"],
};
beforeEach(() => {
  db = createDatabase(":memory:");
  migrate(db);
  seedDemo(db);
  s = createServices(db);
});
afterEach(() => db.close());
function report(key = "test", mediaIds: string[] = []) {
  return s.submitReport(vol, {
    clientRequestId: key,
    text: "Injured cat with reported limp",
    selectedColonyId: "colony-1",
    mediaIds,
  });
}
function proposal(reportId: string, catId = "cat-1"): AgentProposal {
  return {
    reportId,
    colonyCandidates: [
      {
        colonyId: "colony-1",
        evidenceIds: [reportId],
        reasons: ["Reported here"],
      },
    ],
    catCandidates: [
      {
        catId,
        evidenceIds: [reportId],
        reasons: ["Possible match"],
        contradictions: [],
      },
    ],
    observations: [
      {
        kind: "injury",
        statement: "Reporter saw limping",
        source: "reporter",
        evidenceIds: [reportId],
      },
    ],
    urgency: {
      level: "same_day_review",
      reasons: ["Limp reported"],
      evidenceIds: [reportId],
    },
    uncertainties: ["Identity unconfirmed"],
  };
}
function review() {
  const r = report();
  return s.applyAgentProposal(staff, proposal(r.id))[0];
}
const approval = {
  decision: "approve" as const,
  expectedVersion: 1,
  reason: "Staff compared evidence",
  selectedCatId: "cat-1",
};
function merge() {
  const r = report();
  const rev = s.createReview(staff, {
    reportId: r.id,
    action: "merge_cats",
    proposedChange: { sourceCatId: "cat-1", targetCatId: "cat-2" },
    evidenceIds: [r.id],
  });
  s.mergeCats(staff, rev.id, approval);
  return db
    .prepare("SELECT id FROM merge_aliases WHERE review_id=?")
    .get(rev.id) as { id: string };
}
test("assigned colony and own raw report access, no volunteer cat-history evidence", () => {
  const r = report();
  expect(() =>
    s.submitReport(vol, {
      clientRequestId: "outside",
      text: "x",
      selectedColonyId: "colony-2",
      mediaIds: [],
    }),
  ).toThrow();
  expect(() => s.getReport(other, r.id)).toThrow();
  expect(() => s.getReport(vol, "report-2")).toThrow();
  expect(s.getCat(vol, "cat-1")).not.toHaveProperty("observations");
  expect(s.listColonies(vol)).toEqual([
    { id: "colony-1", name: "Mangrove Lantern" },
  ]);
  expect(() => s.getAggregateReport(vol)).toThrow();
  expect(JSON.stringify(s.getAggregateReport(staff))).not.toMatch(
    /demo-only-location|Reporter|user-/,
  );
});
test("volunteer cannot decide; stale versions, changed inputs and cross-user retries conflict", () => {
  const rev = review();
  expect(() => s.decideReview(vol, rev.id, approval)).toThrow();
  expect(() =>
    s.decideReview(staff, rev.id, { ...approval, expectedVersion: 9 }),
  ).toThrow();
  const receipt = s.decideReview(staff, rev.id, approval);
  expect(
    s.decideReview(staff, rev.id, {
      reason: approval.reason,
      expectedVersion: 1,
      decision: "approve",
    }),
  ).toEqual(receipt);
  expect(() => s.decideReview(otherStaff, rev.id, approval)).toThrow();
  expect(() =>
    s.decideReview(staff, rev.id, { ...approval, reason: "Changed" }),
  ).toThrow();
});
test("report retry survives media reconstruction order, and rejects different payload/media owner", () => {
  for (const mid of ["upload-z", "upload-a"])
    db.prepare(
      "INSERT INTO media VALUES (?,NULL,'user-3','synthetic',NULL,0,'2026-11-01T00:00:00.000Z')",
    ).run(mid);
  const r = report("media", ["upload-z", "upload-a"]);
  expect(report("media", ["upload-z", "upload-a"]).id).toBe(r.id);
  expect(() =>
    s.submitReport(vol, {
      clientRequestId: "media",
      text: "Changed",
      selectedColonyId: "colony-1",
      mediaIds: ["upload-z", "upload-a"],
    }),
  ).toThrow();
  db.prepare(
    "INSERT INTO media VALUES ('foreign',NULL,'user-4','synthetic',NULL,0,'2026-11-01T00:00:00.000Z')",
  ).run();
  expect(() => report("foreign", ["foreign"])).toThrow();
  expect(report("separate").id).not.toBe(
    s.submitReport(other, {
      clientRequestId: "separate",
      text: "same key separate user",
      selectedColonyId: "colony-1",
      mediaIds: [],
    }).id,
  );
});
test("invented evidence/candidates, cross-colony cats and malformed proposals cause no partial writes", () => {
  const r = report();
  for (const mutate of [
    (p: AgentProposal) => (p.catCandidates[0].evidenceIds = ["invented"]),
    (p: AgentProposal) => (p.catCandidates[0].catId = "invented"),
    (p: AgentProposal) => (p.catCandidates[0].catId = "cat-5"),
    (p: AgentProposal) => (p.observations[0].source = "visual"),
  ]) {
    const p = proposal(r.id);
    mutate(p);
    expect(() => s.applyAgentProposal(staff, p)).toThrow();
    expect(
      db
        .prepare("SELECT count(*) n FROM observations WHERE report_id=?")
        .get(r.id),
    ).toEqual({ n: 0 });
  }
});
test("two distinct photos link one confirmed identity without inflating census", () => {
  const before = s.getColonySummary(staff, "colony-1");
  s.decideReview(staff, "review-1", approval);
  expect(
    db
      .prepare(
        "SELECT count(*) n FROM observations WHERE report_id='report-1' AND cat_id='cat-1'",
      )
      .get(),
  ).toEqual({ n: 2 });
  expect(s.getColonySummary(staff, "colony-1").confirmedCats).toBe(
    before.confirmedCats,
  );
  expect(s.getReport(staff, "report-1").status).toBe("completed");
});
test("wrong-match rejection preserves observations and census; changed cat invalidates approval", () => {
  const rev = review();
  s.decideReview(staff, rev.id, { ...approval, decision: "reject" });
  expect(
    db
      .prepare("SELECT cat_id FROM observations WHERE report_id=?")
      .get(rev.reportId),
  ).toEqual({ cat_id: null });
  const r = report("changed");
  const next = s.applyAgentProposal(staff, proposal(r.id))[0];
  db.prepare(
    "UPDATE cats SET lifecycle='missing',version=version+1 WHERE id='cat-1'",
  ).run();
  expect(() => s.decideReview(staff, next.id, approval)).toThrow();
  expect(s.listReviews(staff).find((x) => x.id === next.id)?.status).toBe(
    "pending",
  );
});
test("injury visible immediately; routine later proposal never clears alert; no implied feeding", () => {
  const r = report();
  expect(
    s
      .listAlerts(staff)
      .some((a) => a.reportId === r.id && a.level === "same_day_review"),
  ).toBe(true);
  const p = proposal(r.id);
  p.urgency.level = "routine";
  s.applyAgentProposal(staff, p);
  expect(
    s
      .listAlerts(staff)
      .some((a) => a.reportId === r.id && a.level === "same_day_review"),
  ).toBe(true);
  expect(s.getColonySummary(vol, "colony-1").lastFeedingAt).toBeNull();
  const feeder = s.submitReport(vol, {
    clientRequestId: "feeder",
    text: "Feeder unavailable today",
    selectedColonyId: "colony-1",
    mediaIds: [],
  });
  expect(s.listAlerts(staff).find((a) => a.reportId === feeder.id)?.level).toBe(
    "same_day_review",
  );
});
test("explicit feeding is idempotent and late occurrence never replaces newest; unknown TNR separate", () => {
  const input = {
    clientRequestId: "feed",
    colonyId: "colony-1",
    occurredAt: "2026-11-01T12:00:00.500Z",
    evidence: "I completed feeding",
  };
  const v = s.recordFeedingVisit(vol, input);
  expect(s.recordFeedingVisit(vol, input)).toEqual(v);
  s.recordFeedingVisit(vol, {
    ...input,
    clientRequestId: "late",
    occurredAt: "2026-11-01T12:00:00Z",
  });
  expect(s.getColonySummary(vol, "colony-1").lastFeedingAt).toBe(
    input.occurredAt,
  );
  expect(s.getColonySummary(vol, "colony-1").tnrUnknown).toBe(1);
  expect(s.getColonySummary(vol, "colony-1").tnrNeeded).toBe(1);
  expect(() =>
    s.recordFeedingVisit(vol, { ...input, evidence: "changed" }),
  ).toThrow();
});
test("merge preserves original evidence, vet concern and canonical history, reversal restores counts", () => {
  s.decideReview(staff, "review-1", approval);
  const count = s.getColonySummary(staff, "colony-1").confirmedCats;
  const m = merge();
  expect(s.getColonySummary(staff, "colony-1").confirmedCats).toBe(count - 1);
  expect(s.getColonySummary(staff, "colony-1").vetReviewNeeded).toBe(1);
  expect(s.getCat(staff, "cat-2")).toHaveProperty(
    "observations",
    expect.arrayContaining([
      expect.objectContaining({ id: "observation-1", catId: "cat-1" }),
    ]),
  );
  s.reverseMerge(staff, m.id, "Wrong lookalike match");
  expect(s.getColonySummary(staff, "colony-1").confirmedCats).toBe(count);
  expect(
    db
      .prepare("SELECT cat_id FROM observations WHERE id='observation-1'")
      .get(),
  ).toEqual({ cat_id: "cat-1" });
});
test("merge chains and reversal after target lifecycle change are rejected", () => {
  const m = merge();
  const r = report("status");
  const status = s.createReview(staff, {
    reportId: r.id,
    action: "mark_missing",
    proposedChange: { catId: "cat-2" },
    evidenceIds: [r.id],
  });
  s.decideReview(staff, status.id, approval);
  expect(() => s.reverseMerge(staff, m.id, "Unsafe")).toThrow();
  const chain = s.createReview(staff, {
    reportId: r.id,
    action: "merge_cats",
    proposedChange: { sourceCatId: "cat-3", targetCatId: "cat-2" },
    evidenceIds: [r.id],
  });
  expect(() => s.mergeCats(staff, chain.id, approval)).toThrow();
});
