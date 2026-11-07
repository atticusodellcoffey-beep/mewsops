import { actorFromVerifiedSession } from "./session.js";
import type { Db } from "../db/index.js";
import {
  createServices,
  staff,
  fail,
  type Actor,
  type AgentProposal,
} from "../domain/index.js";
import { AgentProposalSchema } from "../contracts/index.js";

type Services = ReturnType<typeof createServices>;
type Report = ReturnType<Services["getReport"]>;
export type AnalysisInput = Pick<
  Report,
  "id" | "text" | "colonyId" | "mediaIds"
>;
export type AnalyzeReport = (
  report: AnalysisInput,
  signal: AbortSignal,
) => Promise<unknown>;

export const syntheticFixture: AnalyzeReport = async (
  report,
): Promise<AgentProposal> => ({
  reportId: report.id,
  colonyCandidates: [],
  catCandidates:
    report.colonyId === "colony-1"
      ? [
          {
            catId: "cat-1",
            evidenceIds: [report.id],
            reasons: ["Synthetic walkthrough candidate"],
            contradictions: [],
          },
        ]
      : [],
  observations: [
    {
      kind: "statement",
      statement: report.text,
      source: "reporter",
      evidenceIds: [report.id],
    },
  ],
  urgency: { level: "routine", reasons: [], evidenceIds: [report.id] },
  uncertainties: ["Synthetic fixture. Identity requires staff review."],
});

export function processor(
  db: Db,
  services: Services,
  analyze: AnalyzeReport | undefined,
  timeout: number,
) {
  const active = new Set<string>();
  return async (actor: Actor, id: string) => {
    staff(actor);
    const report = services.getReport(actor, id);
    if (report.status === "completed" || report.status === "needs_review")
      return report;
    if (active.has(id)) fail("CONFLICT", "Report is being processed", 409);
    if (!analyze)
      return fail(
        "UNAVAILABLE",
        "Analyzer unavailable. Report remains pending.",
        503,
      );
    active.add(id);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("timeout"));
        }, timeout);
      });
      const { text, colonyId, mediaIds } = report;
      const output = AgentProposalSchema.parse(
        await Promise.race([
          deadline,
          analyze({ id, text, colonyId, mediaIds }, controller.signal),
        ]),
      );
      if (output.reportId !== id) throw new Error("Wrong report");
      const currentActor = actorFromVerifiedSession(db, { userId: actor.id });
      services.applyAgentProposal(currentActor, output);
      return services.getReport(actor, id);
    } catch {
      db.prepare(
        "UPDATE reports SET status='failed' WHERE id=? AND status IN ('received','failed')",
      ).run(id);
      return fail(
        "UNAVAILABLE",
        "Analysis failed. Report is saved for staff review or retry.",
        503,
      );
    } finally {
      clearTimeout(timer);
      active.delete(id);
    }
  };
}
