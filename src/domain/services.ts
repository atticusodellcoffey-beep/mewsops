import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { createHash } from "node:crypto";
import { validateReportInput, validateAgentProposal } from "./validation.js";
import type { DomainPort, Cat, Report, Review, Entities } from "./port.js";
import {
  actorValid,
  staff,
  scope,
  nonempty,
  timestamp,
  fail,
  type Actor,
  type ReportInput,
  type AgentProposal,
  type DecisionInput,
  type ReviewAction,
} from "./types.js";
const id = () => randomUUID();
const now = () => new Date().toISOString();
const same = isDeepStrictEqual;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).sort().join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
function proposalHash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
const urgencyRank: Record<string, number> = {
  routine: 0,
  watch: 1,
  same_day_review: 2,
};
export function createDomainServices(p: DomainPort) {
  function get<K extends keyof Entities>(table: K, key: string): Entities[K] {
    return p.get(table, key) ?? fail("NOT_FOUND", `${table} not found`, 404);
  }
  function audit(a: Actor, action: string, entityId: string, detail: unknown) {
    p.put("audit", {
      id: id(),
      actorId: a.id,
      action,
      entityId,
      at: now(),
      detail,
    });
  }
  function reportAccess(a: Actor, r: Report) {
    scope(a, r.colonyId);
    if (a.role !== "staff" && r.actorId !== a.id)
      fail("FORBIDDEN", "Only your own report is accessible", 403);
  }
  function evidence(r: Report, ids: string[]) {
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.some((x) => x !== r.id && !r.mediaIds.includes(x))
    )
      fail(
        "VALIDATION",
        "Evidence must reference this report or its attached media",
      );
  }
  function catIn(colonyId: string, key: unknown): Cat {
    if (typeof key !== "string") fail("VALIDATION", "Cat ID required");
    const c = get("cats", key);
    if (c.colonyId !== colonyId)
      fail("FORBIDDEN", "Cat outside report colony", 403);
    return c;
  }
  function createReviewInternal(
    a: Actor,
    input: {
      reportId: string;
      action: ReviewAction;
      proposedChange: Record<string, unknown>;
      evidenceIds: string[];
    },
  ): Review {
    const r = get("reports", input.reportId);
    reportAccess(a, r);
    const colonyId = r.colonyId ?? String(input.proposedChange.colonyId ?? "");
    scope(a, colonyId);
    get("colonies", colonyId);
    evidence(r, input.evidenceIds);
    if (
      input.proposedChange.colonyId &&
      input.proposedChange.colonyId !== colonyId
    )
      fail("VALIDATION", "Review colony mismatch");
    const change: Record<string, unknown> = structuredClone({
      ...input.proposedChange,
      colonyId,
    });
    const targets: Cat[] = [];
    if (input.action === "merge_cats") {
      targets.push(
        catIn(colonyId, change.sourceCatId),
        catIn(colonyId, change.targetCatId),
      );
      if (targets[0].id === targets[1].id)
        fail("VALIDATION", "Cannot merge cat into itself");
    } else if (
      input.action === "link_observation" &&
      Array.isArray(change.candidates)
    ) {
      for (const candidate of change.candidates as Array<{ catId: unknown }>)
        targets.push(catIn(colonyId, candidate.catId));
    } else if (input.action !== "confirm_new_cat")
      targets.push(catIn(colonyId, change.catId));
    if (
      ![
        "link_observation",
        "confirm_new_cat",
        "merge_cats",
        "mark_adopted",
        "mark_missing",
      ].includes(input.action)
    )
      fail("VALIDATION", "Unknown review action");
    if (
      input.action === "link_observation" ||
      input.action === "confirm_new_cat"
    ) {
      const ids = change.observationIds;
      if (!Array.isArray(ids) || !ids.length)
        fail("VALIDATION", "Observation IDs required");
      for (const oid of ids) {
        const o = get("observations", String(oid));
        if (o.reportId !== r.id || o.catId)
          fail("CONFLICT", "Observation is not pending in this report", 409);
      }
    }
    const review: Review = {
      id: id(),
      reportId: r.id,
      colonyId,
      action: input.action,
      status: "pending",
      version: 1,
      proposedChange: change,
      evidenceIds: [...input.evidenceIds],
      targetSnapshot: structuredClone(targets),
    };
    p.put("reviews", review);
    p.put("reports", { ...r, status: "needs_review" });
    return review;
  }
  const services = {
    submitReport(a: Actor, input: ReportInput): Report {
      actorValid(a);
      input = validateReportInput(input);
      nonempty(input.clientRequestId, "clientRequestId");
      nonempty(input.text, "text");
      if (
        !Array.isArray(input.mediaIds) ||
        new Set(input.mediaIds).size !== input.mediaIds.length
      )
        fail("VALIDATION", "Unique media IDs required");
      scope(a, input.selectedColonyId);
      if (input.selectedColonyId) get("colonies", input.selectedColonyId);
      if (input.observedAt) input.observedAt = timestamp(input.observedAt);
      return p.transaction(() => {
        const prior = p
          .all("reports")
          .find(
            (r) =>
              r.actorId === a.id && r.clientRequestId === input.clientRequestId,
          );
        if (prior) {
          if (
            prior.text !== input.text ||
            prior.colonyId !== (input.selectedColonyId ?? null) ||
            !same([...prior.mediaIds].sort(), [...input.mediaIds].sort()) ||
            prior.observedAt !== input.observedAt ||
            prior.demoLocationId !== input.demoLocationId
          )
            fail(
              "CONFLICT",
              "Request ID already used with different input",
              409,
            );
          return prior;
        }
        for (const mid of input.mediaIds) {
          const m = get("media", mid);
          if (m.ownerId !== a.id)
            fail("FORBIDDEN", "Media must belong to submitter", 403);
          if (m.reportId) fail("CONFLICT", "Media already attached", 409);
        }
        const r: Report = {
          ...structuredClone(input),
          id: id(),
          actorId: a.id,
          colonyId: input.selectedColonyId ?? null,
          receivedAt: now(),
          status: "received",
        };
        p.put("reports", r);
        for (const mid of input.mediaIds)
          p.put("media", { ...get("media", mid), reportId: r.id });
        const urgent =
          /injur|bleed|wound|limp|hit by|struggling|kitten|pregnan|hurt|feeder.*unavailable|unavailable.*feeder|lost.*feeder|no.*feeder/i.test(
            r.text,
          );
        p.put("alerts", {
          id: id(),
          reportId: r.id,
          colonyId: r.colonyId,
          level: urgent ? "same_day_review" : "watch",
          statement: r.text,
          verified: false,
          createdAt: now(),
          status: "open",
          evidenceIds: [r.id],
        });
        audit(a, "submit_report", r.id, { unverified: true });
        return r;
      });
    },
    getReport(a: Actor, key: string) {
      actorValid(a);
      const r = get("reports", key);
      reportAccess(a, r);
      return {
        ...r,
        observations: p.all("observations").filter((o) => o.reportId === key),
        reviews:
          a.role === "staff"
            ? p.all("reviews").filter((o) => o.reportId === key)
            : [],
        alerts: p.all("alerts").filter((o) => o.reportId === key),
      };
    },
    listColonies(a: Actor) {
      actorValid(a);
      return p
        .all("colonies")
        .filter((c) => a.role === "staff" || a.assignedColonyIds.includes(c.id))
        .map((c) => (a.role === "staff" ? c : { id: c.id, name: c.name }));
    },
    getColonySummary(a: Actor, key: string) {
      scope(a, key);
      const colony = get("colonies", key);
      const cats = p
        .all("cats")
        .filter(
          (c) =>
            c.colonyId === key &&
            c.confirmed &&
            c.lifecycle === "active" &&
            !c.canonicalId,
        );
      const reports = p.all("reports").filter((r) => r.colonyId === key);
      const reportIds = new Set(reports.map((r) => r.id));
      const visits = p
        .all("visits")
        .filter((v) => v.colonyId === key)
        .sort((x, y) => Date.parse(y.occurredAt) - Date.parse(x.occurredAt));
      return {
        colony:
          a.role === "staff" ? colony : { id: colony.id, name: colony.name },
        confirmedCats: cats.length,
        fixed: cats.filter((c) => c.sterilization === "fixed").length,
        vetReviewNeeded: cats.filter((c) =>
          p
            .all("cats")
            .some(
              (e) =>
                (e.id === c.id || e.canonicalId === c.id) &&
                e.vetReviewStatus === "needed",
            ),
        ).length,
        tnrNeeded: cats.filter((c) => c.sterilization === "not_fixed").length,
        tnrUnknown: cats.filter((c) => c.sterilization === "unknown").length,
        pendingObservations: p
          .all("observations")
          .filter((o) => reportIds.has(o.reportId) && !o.catId).length,
        lastFeedingAt: visits[0]?.occurredAt ?? null,
        lastFeederId:
          a.role === "staff" ? (visits[0]?.actorId ?? null) : undefined,
      };
    },
    listReviews(a: Actor) {
      staff(a);
      return p.all("reviews");
    },
    getCat(a: Actor, key: string) {
      actorValid(a);
      const c = get("cats", key);
      scope(a, c.colonyId);
      return a.role === "staff"
        ? {
            ...c,
            observations: p
              .all("observations")
              .filter(
                (o) =>
                  o.catId === key ||
                  p
                    .all("cats")
                    .some(
                      (alias) =>
                        alias.id === o.catId && alias.canonicalId === key,
                    ),
              ),
          }
        : { ...c };
    },
    listAlerts(a: Actor) {
      actorValid(a);
      const own = new Set(
        p
          .all("reports")
          .filter((r) => r.actorId === a.id)
          .map((r) => r.id),
      );
      return p
        .all("alerts")
        .filter(
          (x) =>
            x.status !== "resolved" &&
            (a.role === "staff" ||
              (!!x.colonyId &&
                a.assignedColonyIds.includes(x.colonyId) &&
                own.has(x.reportId))),
        );
    },
    recordFeedingVisit(
      a: Actor,
      input: {
        clientRequestId: string;
        colonyId: string;
        occurredAt: string;
        evidence: string;
      },
    ) {
      scope(a, input.colonyId);
      get("colonies", input.colonyId);
      nonempty(input.clientRequestId, "clientRequestId");
      nonempty(input.evidence, "Explicit feeding evidence");
      const occurredAt = new Date(timestamp(input.occurredAt)).toISOString();
      if (Date.parse(occurredAt) > Date.now())
        fail("VALIDATION", "Feeding cannot be in future");
      return p.transaction(() => {
        const prior = p
          .all("visits")
          .find(
            (v) =>
              v.actorId === a.id && v.clientRequestId === input.clientRequestId,
          );
        if (prior) {
          if (
            prior.colonyId !== input.colonyId ||
            prior.occurredAt !== occurredAt ||
            prior.evidence !== input.evidence
          )
            fail("CONFLICT", "Feeding request ID reused", 409);
          return prior;
        }
        const visit = {
          ...input,
          occurredAt,
          id: id(),
          actorId: a.id,
          receivedAt: now(),
        };
        p.put("visits", visit);
        audit(a, "record_feeding", visit.id, { colonyId: input.colonyId });
        return visit;
      });
    },
    createReview(
      a: Actor,
      input: {
        reportId: string;
        action: ReviewAction;
        proposedChange: Record<string, unknown>;
        evidenceIds: string[];
      },
    ) {
      staff(a);
      return p.transaction(() => createReviewInternal(a, input));
    },
    applyAgentProposal(a: Actor, proposal: AgentProposal): Review[] {
      // This method is an internal orchestration seam until the HTTP/API
      // layer exists. Never allow a volunteer/client to manufacture model
      // output that becomes durable observations, alerts, or reviews.
      staff(a);
      proposal = validateAgentProposal(proposal);
      return p.transaction(() => {
        const r = get("reports", proposal.reportId);
        reportAccess(a, r);
        if (!r.colonyId)
          fail("VALIDATION", "Select colony before applying proposals");
        const hash = proposalHash(proposal);
        const priorReceipt = p
          .all("proposalReceipts")
          .find((x) => x.reportId === r.id);
        if (priorReceipt) {
          if (priorReceipt.payloadHash !== hash)
            fail(
              "CONFLICT",
              "A different proposal is already recorded for this report",
              409,
            );
          return priorReceipt.reviewIds.map((id) => get("reviews", id));
        }
        if (
          p.all("observations").some((o) => o.reportId === r.id) ||
          p.all("reviews").some((o) => o.reportId === r.id)
        )
          fail("CONFLICT", "Proposal state exists without a receipt", 409);
        if (
          !Array.isArray(proposal.colonyCandidates) ||
          !Array.isArray(proposal.catCandidates) ||
          !Array.isArray(proposal.observations) ||
          !proposal.urgency
        )
          fail("VALIDATION", "Malformed proposal");
        for (const candidate of proposal.colonyCandidates) {
          evidence(r, candidate.evidenceIds);
          get("colonies", candidate.colonyId);
          scope(a, candidate.colonyId);
          if (candidate.colonyId !== r.colonyId)
            fail("VALIDATION", "Candidate outside selected colony");
        }
        for (const candidate of proposal.catCandidates) {
          evidence(r, candidate.evidenceIds);
          const c = catIn(r.colonyId, candidate.catId);
          if (c.canonicalId || !c.confirmed || c.lifecycle !== "active")
            fail(
              "VALIDATION",
              "Candidate must be an active canonical confirmed cat",
            );
        }
        if (
          new Set(proposal.catCandidates.map((c) => c.catId)).size !==
          proposal.catCandidates.length
        )
          fail("VALIDATION", "Duplicate cat candidate");
        for (const o of proposal.observations) {
          evidence(r, o.evidenceIds);
          nonempty(o.statement, "statement");
          nonempty(o.kind, "kind");
          if (!["reporter", "visual"].includes(o.source))
            fail("VALIDATION", "Invalid observation source");
          if (
            o.source === "visual" &&
            !o.evidenceIds.some((x) => r.mediaIds.includes(x))
          )
            fail("VALIDATION", "Visual statement requires attached media");
        }
        if (
          !["routine", "watch", "same_day_review"].includes(
            proposal.urgency.level,
          )
        )
          fail("VALIDATION", "Invalid urgency");
        evidence(r, proposal.urgency.evidenceIds);
        const obs = proposal.observations.map((o) => ({
          ...o,
          id: id(),
          reportId: r.id,
          catId: null,
        }));
        for (const o of obs) p.put("observations", o);
        if (proposal.urgency.level !== "routine") {
          const existingAlert = p
            .all("alerts")
            .find((x) => x.reportId === r.id && x.status !== "resolved");
          if (existingAlert) {
            const level =
              urgencyRank[proposal.urgency.level] >
              urgencyRank[existingAlert.level]
                ? proposal.urgency.level
                : existingAlert.level;
            const reasons = [
              existingAlert.statement,
              ...proposal.urgency.reasons,
            ].filter((x, i, arr) => arr.indexOf(x) === i);
            const evidenceIds = [
              ...new Set([
                ...(existingAlert.evidenceIds ?? []),
                ...proposal.urgency.evidenceIds,
              ]),
            ];
            p.put("alerts", {
              ...existingAlert,
              level,
              statement: reasons.join("; "),
              evidenceIds,
            });
          } else
            p.put("alerts", {
              id: id(),
              reportId: r.id,
              colonyId: r.colonyId,
              level: proposal.urgency.level,
              statement: proposal.urgency.reasons.join("; "),
              verified: false,
              createdAt: now(),
              status: "open",
              evidenceIds: proposal.urgency.evidenceIds,
            });
        }
        const reviews =
          obs.length && proposal.catCandidates.length
            ? [
                createReviewInternal(a, {
                  reportId: r.id,
                  action: "link_observation",
                  proposedChange: {
                    observationIds: obs.map((o) => o.id),
                    candidates: proposal.catCandidates.map((c) => ({
                      catId: c.catId,
                      reasons: c.reasons,
                      contradictions: c.contradictions,
                      evidenceIds: c.evidenceIds,
                    })),
                  },
                  evidenceIds: proposal.catCandidates.flatMap(
                    (c) => c.evidenceIds,
                  ),
                }),
              ]
            : [];
        p.put("proposalReceipts", {
          id: id(),
          reportId: r.id,
          payloadHash: hash,
          reviewIds: reviews.map((x) => x.id),
          result: reviews.map((x) => ({ id: x.id, version: x.version })),
          createdAt: now(),
        });
        p.put("reports", { ...r, status: "needs_review" });
        audit(a, "agent_proposal", r.id, {
          reviewIds: reviews.map((x) => x.id),
        });
        return reviews;
      });
    },
    decideReview(
      a: Actor,
      key: string,
      input: DecisionInput,
    ): { reviewId: string; status: string; version: number; catId?: string } {
      staff(a);
      nonempty(input.reason, "reason");
      if (
        !["approve", "reject"].includes(input.decision) ||
        !Number.isInteger(input.expectedVersion)
      )
        fail("VALIDATION", "Invalid decision");
      return p.transaction(() => {
        const review = get("reviews", key);
        scope(a, review.colonyId);
        if (
          input.decision === "approve" &&
          review.action === "link_observation" &&
          input.selectedCatId === undefined
        ) {
          const candidates = Array.isArray(review.proposedChange.candidates)
            ? (review.proposedChange.candidates as Array<{ catId: string }>)
            : [];
          input = {
            ...input,
            selectedCatId:
              candidates.length === 1
                ? candidates[0].catId
                : (review.proposedChange.catId as string | undefined),
          };
        }
        if (input.decision === "reject" && review.action === "link_observation")
          input = { ...input, selectedCatId: undefined };
        if (review.receipt) {
          if (
            review.receipt.actorId === a.id &&
            same(review.receipt.input, input)
          )
            return review.receipt.result as {
              reviewId: string;
              status: string;
              version: number;
              catId?: string;
            };
          fail("CONFLICT", "Review already decided", 409);
        }
        if (
          review.status !== "pending" ||
          review.version !== input.expectedVersion
        )
          fail("CONFLICT", "Stale review version", 409);
        let catId: string | undefined;
        if (input.decision === "approve") {
          if (
            review.action === "link_observation" &&
            Array.isArray(review.proposedChange.candidates) &&
            input.selectedCatId === undefined
          )
            fail(
              "VALIDATION",
              "selectedCatId is required to approve candidate link",
            );
        } else if (
          review.action === "link_observation" &&
          input.selectedCatId !== undefined
        )
          fail(
            "VALIDATION",
            "selectedCatId is only valid when approving a candidate link",
          );
        if (input.decision === "approve") {
          for (const frozen of review.targetSnapshot) {
            const current = get("cats", frozen.id);
            if (!same(current, frozen))
              fail("CONFLICT", "Reviewed cat state changed", 409);
          }
          const change = review.proposedChange;
          if (review.action === "merge_cats") {
            const source = catIn(review.colonyId, change.sourceCatId),
              target = catIn(review.colonyId, change.targetCatId);
            if (
              source.id === target.id ||
              !source.confirmed ||
              !target.confirmed ||
              source.lifecycle !== "active" ||
              target.lifecycle !== "active" ||
              p
                .all("merges")
                .some(
                  (m) =>
                    !m.reversed &&
                    [source.id, target.id].some(
                      (cid) => m.sourceId === cid || m.targetId === cid,
                    ),
                )
            )
              fail(
                "CONFLICT",
                "Merge requires two independent active identities; chains are unsupported",
                409,
              );
            p.put("cats", { ...source, version: source.version + 1 });
            p.put("cats", { ...target, version: target.version + 1 });
            p.put("merges", {
              id: id(),
              sourceId: source.id,
              targetId: target.id,
              reviewId: key,
              before: source,
              afterVersion: source.version + 1,
              reversed: false,
              actorId: a.id,
              reason: input.reason,
              at: now(),
            });
            catId = target.id;
          } else if (
            review.action === "mark_adopted" ||
            review.action === "mark_missing"
          ) {
            const cat = catIn(review.colonyId, change.catId);
            if (cat.canonicalId)
              fail("CONFLICT", "Cannot change alias status", 409);
            p.put("cats", {
              ...cat,
              lifecycle:
                review.action === "mark_adopted" ? "adopted" : "missing",
              version: cat.version + 1,
            });
            catId = cat.id;
          } else {
            const observationIds = change.observationIds;
            if (!Array.isArray(observationIds) || !observationIds.length)
              fail("VALIDATION", "Missing observations");
            const observations = observationIds.map((oid) =>
              get("observations", String(oid)),
            );
            if (
              observations.some(
                (o) => o.reportId !== review.reportId || o.catId,
              )
            )
              fail("CONFLICT", "Observation state changed", 409);
            if (review.action === "confirm_new_cat") {
              nonempty(change.name, "Cat name");
              catId = id();
              p.put("cats", {
                id: catId,
                colonyId: review.colonyId,
                name: change.name,
                lifecycle: "active",
                sterilization: "unknown",
                confirmed: true,
                canonicalId: null,
                version: 1,
              });
            } else {
              const selected =
                review.action === "link_observation"
                  ? (input.selectedCatId ?? change.catId)
                  : change.catId;
              if (review.action === "link_observation" && !selected)
                fail(
                  "VALIDATION",
                  "selectedCatId is required to approve candidate link",
                );
              const candidateIds = Array.isArray(change.candidates)
                ? change.candidates.map((c: any) => c.catId)
                : [];
              if (
                review.action === "link_observation" &&
                Array.isArray(change.candidates) &&
                !candidateIds.includes(selected)
              )
                fail(
                  "CONFLICT",
                  "selectedCatId is not a frozen candidate",
                  409,
                );
              const cat = catIn(review.colonyId, selected);
              if (
                !cat.confirmed ||
                cat.canonicalId ||
                cat.lifecycle !== "active"
              )
                fail("CONFLICT", "Cat is no longer eligible", 409);
              catId = cat.id;
            }
            for (const o of observations)
              p.put("observations", { ...o, catId });
          }
        }
        const result = {
          reviewId: key,
          status: input.decision === "approve" ? "approved" : "rejected",
          version: review.version + 1,
          ...(catId ? { catId } : {}),
        };
        p.put("reviews", {
          ...review,
          status: result.status as "approved" | "rejected",
          version: result.version,
          receipt: { actorId: a.id, input: structuredClone(input), result },
        });
        audit(a, "decide_review", key, { input, result });
        const remaining = p
          .all("reviews")
          .some(
            (r) => r.reportId === review.reportId && r.status === "pending",
          );
        const unlinked = p
          .all("observations")
          .some((o) => o.reportId === review.reportId && !o.catId);
        if (!remaining && !unlinked)
          p.put("reports", {
            ...get("reports", review.reportId),
            status: "completed",
          });
        return result;
      });
    },
    mergeCats(a: Actor, reviewId: string, input: DecisionInput) {
      staff(a);
      if (get("reviews", reviewId).action !== "merge_cats")
        fail("VALIDATION", "Merge review required");
      return services.decideReview(a, reviewId, input);
    },
    reverseMerge(a: Actor, key: string, reason: string) {
      staff(a);
      nonempty(reason, "reason");
      return p.transaction(() => {
        const m = get("merges", key);
        if (m.reversed) fail("CONFLICT", "Merge already reversed", 409);
        const source = get("cats", m.sourceId),
          target = get("cats", m.targetId);
        const frozenTarget = get("reviews", m.reviewId).targetSnapshot.find(
          (c) => c.id === target.id,
        );
        if (
          !frozenTarget ||
          !same(target, { ...frozenTarget, version: frozenTarget.version + 1 })
        )
          fail(
            "CONFLICT",
            "Merge target changed; manual reconciliation required",
            409,
          );
        scope(a, source.colonyId);
        if (
          source.version !== m.afterVersion ||
          source.canonicalId !== target.id ||
          p
            .all("merges")
            .some(
              (x) =>
                !x.reversed &&
                x.id !== m.id &&
                [x.sourceId, x.targetId].some(
                  (cid) => cid === source.id || cid === target.id,
                ),
            )
        )
          fail(
            "CONFLICT",
            "Merged identities changed; reversal requires manual reconciliation",
            409,
          );
        p.put("merges", {
          ...m,
          reversed: true,
          reversedBy: a.id,
          reversedAt: now(),
        });
        p.put("cats", { ...source, version: source.version + 1 });
        audit(a, "reverse_merge", key, { reason });
        return { mergeId: key, reversed: true };
      });
    },
    getAggregateReport(a: Actor) {
      staff(a);
      const summaries = services
        .listColonies(a)
        .map((c) => services.getColonySummary(a, c.id));
      return {
        colonyCount: summaries.length,
        confirmedCats: summaries.reduce((n, c) => n + c.confirmedCats, 0),
        fixed: summaries.reduce((n, c) => n + c.fixed, 0),
        vetReviewNeeded: summaries.reduce((n, c) => n + c.vetReviewNeeded, 0),
        tnrNeeded: summaries.reduce((n, c) => n + c.tnrNeeded, 0),
        tnrUnknown: summaries.reduce((n, c) => n + c.tnrUnknown, 0),
        pendingObservations: summaries.reduce(
          (n, c) => n + c.pendingObservations,
          0,
        ),
      };
    },
  };
  return services;
}
