import { it, expect } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  demoAnalyzer,
  readDemoDescriptions,
} from "../../src/api/demo-runtime.js";
import { syntheticFixture } from "../../src/api/processing.js";

it("defaults to the labeled fixture and rejects unknown modes", async () => {
  expect(await demoAnalyzer()).toBe(syntheticFixture);
  await expect(demoAnalyzer("automatic")).rejects.toThrow("fixture or agent");
});

it("loads a vetted fixture if present and rejects malformed descriptions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mewsops-descriptions-"));
  const path = pathToFileURL(join(dir, "demo-cat-descriptions.json"));
  try {
    expect((await readDemoDescriptions(path)).size).toBe(0);
    await writeFile(path, JSON.stringify({ "cat-1": " Synthetic white bib " }));
    expect((await readDemoDescriptions(path)).get("cat-1")).toBe(
      "Synthetic white bib",
    );
    await writeFile(path, JSON.stringify({ "cat-1": { name: "irrelevant" } }));
    await expect(readDemoDescriptions(path)).rejects.toThrow();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
