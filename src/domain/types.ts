export type Actor = {
  id: string;
  role: "staff" | "volunteer";
  assignedColonyIds: string[];
};
export type ReportInput = {
  clientRequestId: string;
  text: string;
  selectedColonyId?: string;
  mediaIds: string[];
  demoLocationId?: string;
  observedAt?: string;
};
export type AgentProposal = {
  reportId: string;
  colonyCandidates: {
    colonyId: string;
    evidenceIds: string[];
    reasons: string[];
  }[];
  catCandidates: {
    catId: string;
    evidenceIds: string[];
    reasons: string[];
    contradictions: string[];
  }[];
  observations: {
    kind: string;
    statement: string;
    source: "reporter" | "visual";
    evidenceIds: string[];
  }[];
  urgency: {
    level: "routine" | "watch" | "same_day_review";
    reasons: string[];
    evidenceIds: string[];
  };
  uncertainties: string[];
};
export type DecisionInput = {
  decision: "approve" | "reject";
  expectedVersion: number;
  reason: string;
  selectedCatId?: string;
};
export type ReviewAction =
  | "link_observation"
  | "confirm_new_cat"
  | "merge_cats"
  | "mark_adopted"
  | "mark_missing";
export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
export function fail(code: string, message: string, status = 400): never {
  throw new DomainError(code, message, status);
}
export function actorValid(actor: Actor) {
  if (
    !actor?.id ||
    !["staff", "volunteer"].includes(actor.role) ||
    !Array.isArray(actor.assignedColonyIds)
  )
    fail("UNAUTHORIZED", "Trusted actor required", 401);
}
export function staff(actor: Actor) {
  actorValid(actor);
  if (actor.role !== "staff") fail("FORBIDDEN", "Staff review required", 403);
}
export function scope(actor: Actor, colonyId: string | null | undefined) {
  actorValid(actor);
  if (
    actor.role !== "staff" &&
    (!colonyId || !actor.assignedColonyIds.includes(colonyId))
  )
    fail("FORBIDDEN", "Colony is outside assigned scope", 403);
}
export function nonempty(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string" || !value.trim())
    fail("VALIDATION", `${label} is required`);
}
export function timestamp(value: string) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
  )
    fail("VALIDATION", "Expected ISO UTC timestamp");
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds))
    fail("VALIDATION", "Expected a real UTC date");
  const normalized = new Date(milliseconds).toISOString();
  const expected = value.replace(
    /(?:\.(\d{1,3}))?Z$/,
    (_, fraction: string | undefined) => `.${(fraction ?? "").padEnd(3, "0")}Z`,
  );
  if (normalized !== expected) fail("VALIDATION", "Expected a real UTC date");
  return normalized;
}
