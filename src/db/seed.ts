import type { Db } from "./types.js";
import { repositories } from "./repositories.js";
export const DEMO_TIME = "2026-11-07T12:00:00.000Z";
/** Insert once; never overwrite a running demo. All records are fictional. */
export function seedDemo(db: Db): void {
  db.transaction(() => {
    db.exec("CREATE TABLE IF NOT EXISTS demo_seed (id TEXT PRIMARY KEY)");
    if (db.prepare("SELECT 1 FROM demo_seed WHERE id=?").get("mewsops-v1"))
      return;
    const r = repositories(db);
    const names = ["Mangrove Lantern", "Coral Courtyard", "Banyan Cove"];
    for (let n = 1; n <= 18; n++)
      r.colonies.insert({
        id: `colony-${n}`,
        name: names[n - 1] ?? `Fictional Grove ${n}`,
        location_label: `Synthetic zone ${n}`,
        exact_location: `demo-only-location-${n}`,
      });
    for (let n = 1; n <= 20; n++) {
      r.users.insert({
        id: `user-${n}`,
        name: `Demo ${n <= 2 ? "Staff" : "Volunteer"} ${n}`,
        role: n <= 2 ? "staff" : "volunteer",
        available: n === 5 ? 0 : 1,
      });
      r.assignments.assign(
        `user-${n}`,
        `colony-${n <= 2 ? n : ((n - 3) % 3) + 1}`,
      );
    }
    for (let n = 1; n <= 12; n++)
      r.cats.insert({
        id: `cat-${n}`,
        colony_id: `colony-${Math.ceil(n / 4)}`,
        name: [
          "Pebble",
          "Pebble Lookalike",
          "Lantern",
          "Sprout",
          "Coral",
          "Shell",
          "Ripple",
          "Kelp",
          "Banyan",
          "Moss",
          "Fern",
          "Bud",
        ][n - 1]!,
        lifecycle: "active",
        sterilization:
          n % 3 === 0 ? "unknown" : n % 3 === 1 ? "fixed" : "not_fixed",
        identity_confirmed: n === 12 ? 0 : 1,
        vet_review_status: n === 1 ? "needed" : "none",
        created_at: DEMO_TIME,
        version: 1,
      });
    const texts = [
      "Pebble limping near the fictional lantern. Same cat photographed from two angles; identity needs staff review.",
      "Reported kittens and possibly pregnant cat; unconfirmed.",
      "Feeder unavailable today. No recent feeding recorded; this is not proof no one fed.",
    ];
    for (let n = 1; n <= 3; n++)
      r.reports.insert({
        id: `report-${n}`,
        actor_id: `user-${n + 2}`,
        client_request_id: `demo-report-${n}`,
        text: texts[n - 1]!,
        selected_colony_id: `colony-${n}`,
        demo_location_id: `demo-location-${n}`,
        observed_at: "2026-11-07T11:00:00.000Z",
        received_at: DEMO_TIME,
        status: "needs_review",
      });
    for (let n = 1; n <= 2; n++) {
      r.media.insert({
        id: `media-${n}`,
        report_id: "report-1",
        uploaded_by: "user-3",
        storage_ref: `synthetic-reference://pebble-angle-${n}.png`,
        sha256: null,
        available: 0,
        created_at: DEMO_TIME,
      });
      r.observations.insert({
        id: `observation-${n}`,
        report_id: "report-1",
        cat_id: null,
        kind: "appearance",
        statement: `Synthetic reference angle ${n} for Pebble; asset not supplied.`,
        source: "reporter",
        evidence_ids: JSON.stringify([`media-${n}`]),
        observed_at: "2026-11-07T11:00:00.000Z",
        created_at: DEMO_TIME,
      });
    }
    r.observations.insert({
      id: "observation-kittens",
      report_id: "report-2",
      cat_id: null,
      kind: "kittens",
      statement: "Kittens reported, identities and number unconfirmed.",
      source: "reporter",
      evidence_ids: '["report-2"]',
      observed_at: null,
      created_at: DEMO_TIME,
    });
    for (let n = 1; n <= 3; n++)
      r.alerts.insert({
        id: `alert-${n}`,
        report_id: `report-${n}`,
        colony_id: `colony-${n}`,
        level: "same_day_review",
        reasons: JSON.stringify([
          n === 1
            ? "Reported limping; staff review needed."
            : n === 2
              ? "Reported kittens/pregnancy; staff review needed."
              : "Feeder unavailable; feeding coverage needs review.",
        ]),
        evidence_ids: JSON.stringify([`report-${n}`]),
        status: "open",
        created_at: DEMO_TIME,
      });
    r.feeding_visits.insert({
      id: "visit-stale",
      colony_id: "colony-3",
      feeder_id: "user-5",
      report_id: null,
      occurred_at: "2026-10-30T12:00:00.000Z",
      recorded_at: "2026-10-30T12:05:00.000Z",
      confirmed_by: "user-1",
      client_request_id: "seed-stale",
      evidence: "Synthetic staff-confirmed feeding visit.",
    });
    r.review_requests.insert({
      id: "review-1",
      report_id: "report-1",
      action: "link_observation",
      status: "pending",
      version: 1,
      proposed_change:
        '{"catId":"cat-1","observationIds":["observation-1","observation-2"],"colonyId":"colony-1"}',
      evidence_ids: '["media-1","media-2"]',
      target_snapshot: JSON.stringify([
        {
          id: "cat-1",
          colonyId: "colony-1",
          name: "Pebble",
          lifecycle: "active",
          sterilization: "fixed",
          confirmed: true,
          canonicalId: null,
          version: 1,
          vetReviewStatus: "needed",
        },
      ]),
      receipt: null,
      created_at: DEMO_TIME,
      decided_by: null,
      decided_at: null,
      decision_reason: null,
    });
    db.prepare("INSERT INTO demo_seed VALUES (?)").run("mewsops-v1");
  }).immediate();
}
