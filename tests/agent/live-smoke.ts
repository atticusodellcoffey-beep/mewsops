import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { analyzeReport, type AnalyzeReportInput } from "../../src/agent/index.js";

const fixturePath = fileURLToPath(
  new URL("../../fixtures/agent/injury-text.json", import.meta.url),
);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as {
  input: AnalyzeReportInput;
};
const model = process.env.MEWSOPS_AGENT_MODEL?.trim() || "gpt-5.4-mini";
let usage:
  | { model: string; inputTokens: number; outputTokens: number; totalTokens: number }
  | undefined;
const started = performance.now();
const proposal = await analyzeReport(fixture.input, {
  mode: "live",
  onUsage: (summary) => {
    usage = summary;
  },
});

console.log(
  JSON.stringify(
    {
      evaluation: "synthetic text-only smoke; this is an observed live model result",
      model,
      elapsedMs: Math.round(performance.now() - started),
      usage: usage ?? "not returned by SDK",
      cost: "not returned by SDK",
      proposal,
    },
    null,
    2,
  ),
);
