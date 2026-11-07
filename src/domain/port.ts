import type { ReportInput, ReviewAction } from "./types.js";
export type Colony = {
  id: string;
  name: string;
  exactLocation?: unknown;
  contact?: unknown;
};
export type Cat = {
  id: string;
  colonyId: string;
  name: string;
  lifecycle: "active" | "adopted" | "missing";
  sterilization: "unknown" | "fixed" | "not_fixed";
  confirmed: boolean;
  canonicalId: string | null;
  version: number;
  vetReviewStatus?: "none" | "needed" | "reviewed";
};
export type Report = ReportInput & {
  id: string;
  actorId: string;
  colonyId: string | null;
  receivedAt: string;
  status: string;
};
export type Media = { id: string; ownerId: string; reportId: string | null };
export type Observation = {
  id: string;
  reportId: string;
  catId: string | null;
  kind: string;
  statement: string;
  source: string;
  evidenceIds: string[];
};
export type Review = {
  id: string;
  reportId: string;
  colonyId: string;
  action: ReviewAction;
  status: "pending" | "approved" | "rejected";
  version: number;
  proposedChange: Record<string, unknown>;
  evidenceIds: string[];
  targetSnapshot: Cat[];
  receipt?: { actorId: string; input: unknown; result: unknown };
};
export type Alert = {
  id: string;
  reportId: string;
  colonyId: string | null;
  level: string;
  statement: string;
  verified: boolean;
  createdAt: string;
  status?: "open" | "resolved";
  evidenceIds?: string[];
};
export type Visit = {
  id: string;
  actorId: string;
  clientRequestId: string;
  colonyId: string;
  occurredAt: string;
  receivedAt: string;
  evidence: string;
};
export type Merge = {
  id: string;
  sourceId: string;
  targetId: string;
  reviewId: string;
  before: Cat;
  afterVersion: number;
  reversed: boolean;
  actorId?: string;
  reason?: string;
  at?: string;
  reversedBy?: string;
  reversedAt?: string;
};
export type Audit = {
  id: string;
  actorId: string;
  action: string;
  entityId: string;
  at: string;
  detail: unknown;
};
export type Entities = {
  colonies: Colony;
  cats: Cat;
  reports: Report;
  media: Media;
  observations: Observation;
  reviews: Review;
  alerts: Alert;
  visits: Visit;
  merges: Merge;
  audit: Audit;
};
/** Transaction callback must be synchronous, serializable, and roll back all writes on throw. */
export interface DomainPort {
  transaction<T>(work: () => T): T;
  get<K extends keyof Entities>(table: K, id: string): Entities[K] | undefined;
  all<K extends keyof Entities>(table: K): Entities[K][];
  put<K extends keyof Entities>(table: K, row: Entities[K]): void;
}
