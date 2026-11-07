import type Database from "better-sqlite3";
export type Db = Database.Database;
export type Role = "staff" | "volunteer";
export interface User {
  id: string;
  name: string;
  role: Role;
  available: number;
}
export interface Colony {
  id: string;
  name: string;
  location_label: string;
  exact_location: string | null;
}
export interface Cat {
  version: number;
  id: string;
  colony_id: string;
  name: string;
  lifecycle: "active" | "adopted" | "missing";
  sterilization: "unknown" | "fixed" | "not_fixed";
  identity_confirmed: number;
  vet_review_status: "none" | "needed" | "reviewed";
  created_at: string;
}
export interface Report {
  id: string;
  actor_id: string;
  client_request_id: string;
  text: string;
  selected_colony_id: string | null;
  demo_location_id: string | null;
  observed_at: string | null;
  received_at: string;
  status: "received" | "processing" | "needs_review" | "completed" | "failed";
}
export interface Media {
  id: string;
  report_id: string | null;
  uploaded_by: string;
  storage_ref: string;
  sha256: string | null;
  available: number;
  created_at: string;
}
export interface Observation {
  id: string;
  report_id: string;
  cat_id: string | null;
  kind: string;
  statement: string;
  source: "reporter" | "visual" | "confirmed";
  evidence_ids: string;
  observed_at: string | null;
  created_at: string;
}
export interface ReviewRequest {
  id: string;
  report_id: string;
  action:
    | "link_observation"
    | "confirm_new_cat"
    | "merge_cats"
    | "mark_adopted"
    | "mark_missing";
  status: "pending" | "approved" | "rejected";
  version: number;
  proposed_change: string;
  evidence_ids: string;
  created_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  target_snapshot: string;
  receipt: string | null;
}
export interface Alert {
  id: string;
  report_id: string;
  colony_id: string | null;
  level: "routine" | "watch" | "same_day_review";
  reasons: string;
  evidence_ids: string;
  status: "open" | "resolved";
  created_at: string;
}
export interface FeedingVisit {
  id: string;
  colony_id: string;
  feeder_id: string;
  report_id: string | null;
  occurred_at: string;
  recorded_at: string;
  confirmed_by: string;
  client_request_id: string;
  evidence: string;
}
export interface AuditEvent {
  id: string;
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  before_json: string | null;
  after_json: string | null;
  reason: string;
  created_at: string;
}
export interface MergeAlias {
  id: string;
  alias_cat_id: string;
  canonical_cat_id: string;
  created_by: string;
  created_at: string;
  reversed_by: string | null;
  reversed_at: string | null;
  reason: string;
  review_id: string | null;
  snapshot: string | null;
  after_version: number | null;
}
export interface Tables {
  users: User;
  colonies: Colony;
  cats: Cat;
  reports: Report;
  media: Media;
  observations: Observation;
  review_requests: ReviewRequest;
  alerts: Alert;
  feeding_visits: FeedingVisit;
  audit_events: AuditEvent;
  merge_aliases: MergeAlias;
}
