import { z } from "zod";
import { validateAgentProposal, validateReportInput } from "../domain/validation.js";
import { timestamp } from "../domain/types.js";
export type { Actor, AgentProposal, ReportInput, DecisionInput } from "../domain/types.js";

// Share the backend's strict parsers until its schemas are exported directly.
function contract<T>(parse: (value: unknown) => T) {
  return z.unknown().transform((value, ctx) => {
    try { return parse(value); }
    catch { ctx.addIssue({ code: "custom", message: "Invalid contract payload" }); return z.NEVER; }
  });
}
export const ReportInputSchema = contract(value => {
  const input = validateReportInput(value);
  if (input.observedAt !== undefined) input.observedAt = timestamp(input.observedAt);
  return input;
});
export const AgentProposalSchema = contract(validateAgentProposal);
export const DecisionInputSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(1).max(2000),
  selectedCatId: z.string().min(1).max(200).optional(),
}).strict();
export const ReportStatusSchema = z.enum(["received","processing","needs_review","completed","failed"]);
export const ReviewSchema = z.object({
  id: z.string(), reportId: z.string(), action: z.enum(["link_observation","confirm_new_cat","merge_cats","mark_adopted","mark_missing"]),
  status: z.enum(["pending","approved","rejected"]), version: z.number().int(),
  proposedChange: z.record(z.string(), z.unknown()), evidenceIds: z.array(z.string()),
});
export type Review = z.infer<typeof ReviewSchema>;
export type Envelope<T> = {data: T} | {error: {code: string; message: string; requestId: string}};
