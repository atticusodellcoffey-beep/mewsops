import { z } from "zod";
import { fail, type AgentProposal, type ReportInput } from "./types.js";

const identifier = z.string().min(1).max(200);
const text = z.string().min(1).max(20_000);
const reasons = z.array(z.string().min(1).max(2_000)).max(30);
const evidence = z.array(identifier).min(1).max(30);

const reportSchema = z
  .object({
    clientRequestId: identifier,
    text,
    selectedColonyId: identifier.optional(),
    mediaIds: z.array(identifier).max(10),
    demoLocationId: identifier.optional(),
    observedAt: z.string().max(30).optional(),
  })
  .strict();

const proposalSchema = z
  .object({
    reportId: identifier,
    colonyCandidates: z
      .array(z.object({ colonyId: identifier, evidenceIds: evidence, reasons }))
      .max(18),
    catCandidates: z
      .array(
        z.object({
          catId: identifier,
          evidenceIds: evidence,
          reasons,
          contradictions: reasons,
        }),
      )
      .max(20),
    observations: z
      .array(
        z.object({
          kind: z.string().min(1).max(100),
          statement: text,
          source: z.enum(["reporter", "visual"]),
          evidenceIds: evidence,
        }),
      )
      .max(50),
    urgency: z.object({
      level: z.enum(["routine", "watch", "same_day_review"]),
      reasons,
      evidenceIds: evidence,
    }),
    uncertainties: reasons,
  })
  .strict();

export function validateReportInput(value: unknown): ReportInput {
  const result = reportSchema.safeParse(value);
  if (!result.success) fail("VALIDATION", "Malformed report input");
  return result.data;
}

export function validateAgentProposal(value: unknown): AgentProposal {
  const result = proposalSchema.safeParse(value);
  if (!result.success) fail("VALIDATION", "Malformed agent proposal");
  return result.data;
}
