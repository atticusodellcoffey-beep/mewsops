import {
  createDatabase,
  migrate,
  seedDemo,
  DEMO_DATABASE_PATH,
} from "./db/index.js";
import { createServices } from "./domain/index.js";
import type { Actor } from "./domain/types.js";
import { demoProposal, demoReport } from "../scripts/demo-scenario.js";

const db = createDatabase(DEMO_DATABASE_PATH);
try {
  migrate(db);
  seedDemo(db);
  const services = createServices(db);
  const staffRow = db
    .prepare("SELECT id FROM users WHERE role = 'staff' ORDER BY id LIMIT 1")
    .get() as { id: string };
  const assignment = db
    .prepare(
      `SELECT u.id AS actorId, a.colony_id AS colonyId, c.id AS catId
    FROM users u JOIN colony_assignments a ON a.user_id=u.id
    JOIN cats c ON c.colony_id=a.colony_id
    WHERE u.role='volunteer' AND c.identity_confirmed=1 AND c.lifecycle='active'
    ORDER BY u.id,c.id LIMIT 1`,
    )
    .get() as { actorId: string; colonyId: string; catId: string };
  if (!staffRow || !assignment)
    throw new Error(
      "Demo fixtures require staff and an assigned volunteer with a confirmed cat.",
    );
  const staff: Actor = {
    id: staffRow.id,
    role: "staff",
    assignedColonyIds: [],
  };
  const volunteer: Actor = {
    id: assignment.actorId,
    role: "volunteer",
    assignedColonyIds: [assignment.colonyId],
  };
  console.log(
    "MewsOps local backend — synthetic data only. No HTTP server or live AI inference.",
  );
  console.log(
    JSON.stringify(
      {
        database: DEMO_DATABASE_PATH,
        colony: services.getColonySummary(staff, assignment.colonyId),
      },
      null,
      2,
    ),
  );
  if (process.argv.includes("--demo")) {
    const input = demoReport(assignment.colonyId, "cli-injured-cat-v1");
    services.submitReport(volunteer, input);
    const report = db
      .prepare(
        "SELECT id FROM reports WHERE actor_id=? AND client_request_id=?",
      )
      .get(volunteer.id, input.clientRequestId) as { id: string };
    console.log(
      "Report persisted. Immediate reported concerns:",
      JSON.stringify(
        services
          .listAlerts(staff)
          .filter((alert) => alert.reportId === report.id),
        null,
        2,
      ),
    );
    console.log(
      "Applying a deterministic proposal fixture; no image inspection is performed.",
    );
    const existing = services
      .listReviews(staff)
      .filter((review) => review.reportId === report.id);
    if (existing.length === 0)
      services.applyAgentProposal(
        staff,
        demoProposal(report.id, assignment.colonyId, assignment.catId, [
          report.id,
        ]),
      );
    const reviews = services
      .listReviews(staff)
      .filter(
        (review) =>
          review.reportId === report.id && review.status === "pending",
      );
    for (const review of reviews) {
      if (review.action === "link_observation") {
        const receipt = services.decideReview(staff, review.id, {
          decision: "approve",
          expectedVersion: review.version,
          reason: "Synthetic CLI demo: staff confirms the fixture identity.",
        });
        console.log("Persisted review receipt:", JSON.stringify(receipt));
      }
    }
    console.log(
      "After explicit demo staff approval:",
      JSON.stringify(
        services.getColonySummary(staff, assignment.colonyId),
        null,
        2,
      ),
    );
    console.log(
      "Linked observations for this report:",
      JSON.stringify(
        services.getReport(staff, report.id).observations,
        null,
        2,
      ),
    );
    console.log(
      "Volunteer-safe view:",
      JSON.stringify(
        services.getColonySummary(volunteer, assignment.colonyId),
        null,
        2,
      ),
    );
  } else {
    console.log(
      "Run npm run demo for the persisted injury-report and staff-review walkthrough.",
    );
  }
} finally {
  db.close();
}
