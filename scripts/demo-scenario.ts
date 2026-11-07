import type { AgentProposal, ReportInput } from "../src/domain/types.js";

/** Deterministic integration fixture. This is not a live or recorded model response. */
export function demoReport(
  colonyId: string,
  key: string,
  mediaIds: string[] = [],
): ReportInput {
  return {
    clientRequestId: key,
    selectedColonyId: colonyId,
    text: "SYNTHETIC DEMO: A feeder reports an injured gray cat. Identity is uncertain; please review today. No feeding was recorded during this sighting.",
    mediaIds,
    observedAt: "2026-11-07T17:00:00.000Z",
  };
}

export function demoProposal(
  reportId: string,
  colonyId: string,
  catId: string,
  evidenceIds: string[],
): AgentProposal {
  return {
    reportId,
    colonyCandidates: [
      {
        colonyId,
        evidenceIds,
        reasons: ["The fictional reporter selected this colony."],
      },
    ],
    catCandidates: [
      {
        catId,
        evidenceIds,
        reasons: ["Synthetic test candidate supplied by this fixture."],
        contradictions: [],
      },
    ],
    observations: [
      {
        kind: "reported_injury",
        statement:
          "The reporter describes an injured gray cat; this is unverified.",
        source: "reporter",
        evidenceIds,
      },
    ],
    urgency: {
      level: "same_day_review",
      reasons: ["Reported injury requires human review."],
      evidenceIds,
    },
    uncertainties: [
      "This fixture does not inspect an image or establish identity. Staff must confirm the proposed link.",
    ],
  };
}
