export interface AnalyzeReportInput {
  reportId: string;
  text: string;
  textEvidenceId: string;
  observedAt?: string;
  images: { evidenceId: string; mimeType: "image/png"; dataBase64: string }[];
  context: {
    colonyCandidates: { colonyId: string; name: string }[];
    catCandidates: {
      catId: string;
      colonyId: string;
      knownDescription?: string;
    }[];
  };
}
