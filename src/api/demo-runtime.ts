import { readFile } from "node:fs/promises";
import { z } from "zod";
import { syntheticFixture, type AnalyzeReport } from "./processing.js";

const fixturePath = new URL(
  "../../fixtures/agent/demo-cat-descriptions.json",
  import.meta.url,
);

export async function readDemoDescriptions(path = fixturePath) {
  let json: string;
  try {
    json = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return new Map<string, string>();
    throw error;
  }
  const descriptions = z
    .record(z.string().min(1).max(200), z.string().trim().min(1).max(400))
    .parse(JSON.parse(json));
  return new Map(Object.entries(descriptions));
}

export async function demoAnalyzer(mode = "fixture"): Promise<AnalyzeReport> {
  if (mode === "fixture") return syntheticFixture;
  if (mode !== "agent")
    throw new Error("MEWSOPS_ANALYSIS must be fixture or agent");
  // The agent lane ships separately. Resolve its fixed entry point for tsx or compiled ESM.
  const extension = import.meta.url.endsWith(".ts") ? "ts" : "js";
  const entry = new URL("../agent/index." + extension, import.meta.url);
  const agent = await import(entry.href);
  if (typeof agent.analyzeReport !== "function")
    throw new Error("Agent entry point must export analyzeReport");
  return agent.analyzeReport;
}
