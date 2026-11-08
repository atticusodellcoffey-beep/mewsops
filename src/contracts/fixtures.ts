import type { ReportInput, DecisionInput } from "./index.js";

/** Synthetic frontend walkthrough. Replace request IDs for each new submission. */
export const demoReport: ReportInput = {
  clientRequestId: "demo-phone-1",
  text: "Cat limping beside the fictional gate.",
  selectedColonyId: "colony-1",
  mediaIds: [],
};
export const demoDecision: DecisionInput = {
  decision: "approve",
  expectedVersion: 1,
  reason: "Compared the synthetic observations.",
  selectedCatId: "cat-1",
};
