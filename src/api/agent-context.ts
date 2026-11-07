import type { AnalyzeReportInput } from "../contracts/agent.js";
import type { Db } from "../db/index.js";
import type { Actor, AgentProposal, Report } from "../domain/index.js";
import { loadMedia } from "./media.js";

export async function prepareAnalysis(
  db: Db,
  uploadDir: string,
  actor: Actor,
  report: Report,
  descriptions?: ReadonlyMap<string, string>,
): Promise<AnalyzeReportInput> {
  const colony = db
    .prepare("SELECT id AS colonyId, name FROM colonies WHERE id=?")
    .get(report.colonyId) as { colonyId: string; name: string } | undefined;
  if (!colony) throw new Error("Select a colony before analysis");
  const cats = db
    .prepare(
      `
    SELECT id AS catId, colony_id AS colonyId FROM cats c
    WHERE colony_id=? AND lifecycle='active' AND identity_confirmed=1
    AND NOT EXISTS (SELECT 1 FROM merge_aliases m WHERE m.alias_cat_id=c.id AND m.reversed_at IS NULL)
    ORDER BY id LIMIT 20
  `,
    )
    .all(colony.colonyId) as { catId: string; colonyId: string }[];
  const images: AnalyzeReportInput["images"] = [];
  for (const evidenceId of report.mediaIds) {
    const bytes = await loadMedia(db, uploadDir, actor, evidenceId);
    images.push({
      evidenceId,
      mimeType: "image/png",
      dataBase64: bytes.toString("base64"),
    });
  }
  return {
    reportId: report.id,
    textEvidenceId: report.id,
    text: report.text,
    ...(report.observedAt && { observedAt: report.observedAt }),
    images,
    context: {
      colonyCandidates: [colony],
      catCandidates: cats.map((cat) => {
        const knownDescription = descriptions?.get(cat.catId)?.trim();
        return knownDescription ? { ...cat, knownDescription } : cat;
      }),
    },
  };
}

// Snapshot the allowed references before passing mutable input to the analyzer.
export function proposalGuard(input: AnalyzeReportInput) {
  const reportId = input.reportId;
  const media = new Set(input.images.map((i) => i.evidenceId));
  const cats = new Set(input.context.catCandidates.map((c) => c.catId));
  const colonies = new Set(
    input.context.colonyCandidates.map((c) => c.colonyId),
  );
  return (p: AgentProposal) => {
    const items = [
      ...p.observations,
      ...p.catCandidates,
      ...p.colonyCandidates,
      p.urgency,
    ];
    if (
      p.reportId !== reportId ||
      p.catCandidates.some((c) => !cats.has(c.catId)) ||
      p.colonyCandidates.some((c) => !colonies.has(c.colonyId)) ||
      items.some((item) =>
        item.evidenceIds.some((id) => id !== reportId && !media.has(id)),
      ) ||
      p.observations.some((o) =>
        o.source === "visual"
          ? !o.evidenceIds.some((id) => media.has(id))
          : !o.evidenceIds.includes(reportId),
      )
    )
      throw new Error(
        "Proposal references evidence outside the supplied context",
      );
  };
}
