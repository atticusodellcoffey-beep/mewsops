import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { analyzeReport } from "../../src/agent/index.js";
import type { AgentProposal } from "../../src/domain/types.js";

type AgentFixture = {
  id: string;
  provenance: string;
  evaluationStatus?: "deterministic_scope_case" | "unresolved_missing_synthetic_assets";
  input: Parameters<typeof analyzeReport>[0];
  expectedProposal: AgentProposal;
};

const fixtureDirectory = fileURLToPath(new URL("../../fixtures/agent/", import.meta.url));
const fixtures = readdirSync(fixtureDirectory)
  .filter((name) => name.endsWith(".json"))
  .map((name) =>
    JSON.parse(readFileSync(`${fixtureDirectory}/${name}`, "utf8")) as AgentFixture,
  );

test("fixture mode returns validated proposals for every synthetic case", async () => {
  expect(fixtures).toHaveLength(12);
  expect(fixtures.map(({ id }) => id)).toEqual(
    expect.arrayContaining([
      "routine-feeding-01",
      "injury-text-01",
      "suspected-pregnancy-01",
      "kittens-reported-01",
      "feeder-unavailable-01",
      "duplicate-image-bytes-06",
      "distinct-views-same-cat-07",
      "lookalike-cats-08",
      "blurry-image-09",
      "contradictory-colony-10",
      "adoption-claim-11",
      "prompt-injection-12",
    ]),
  );

  const fixtureProposals = new Map(
    fixtures.map(({ input, expectedProposal }) => [input.reportId, expectedProposal]),
  );

  for (const fixture of fixtures) {
    await expect(
      analyzeReport(fixture.input, { mode: "fixture", fixtureProposals }),
    ).resolves.toEqual(fixture.expectedProposal);
  }
});

test("blocked visual identity evaluations stay explicitly unresolved", () => {
  const blocked = fixtures.filter(
    (fixture) => fixture.evaluationStatus === "unresolved_missing_synthetic_assets",
  );
  expect(blocked.map(({ id }) => id)).toEqual(
    expect.arrayContaining([
      "duplicate-image-bytes-06",
      "distinct-views-same-cat-07",
      "lookalike-cats-08",
      "blurry-image-09",
    ]),
  );
  for (const fixture of blocked) {
    expect(fixture.input.images).toEqual([]);
    expect(fixture.expectedProposal.catCandidates).toEqual([]);
    expect(fixture.provenance).toMatch(/unavailable|missing|no .* asset/i);
  }
});

test("fixture mode is deterministic and requires no API key", async () => {
  const fixture = fixtures[0]!;
  const previousKey = process.env.OPENAI_API_KEY;
  const previousMode = process.env.MEWSOPS_AGENT_MODE;
  delete process.env.OPENAI_API_KEY;
  delete process.env.MEWSOPS_AGENT_MODE;
  try {
    const first = await analyzeReport(fixture.input, { mode: "fixture" });
    const second = await analyzeReport(fixture.input, { mode: "fixture" });
    expect(first).toEqual(second);
    expect(first.uncertainties).toContain(
      "Deterministic fixture response; no model inference or identity match was performed.",
    );
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
    if (previousMode === undefined) delete process.env.MEWSOPS_AGENT_MODE;
    else process.env.MEWSOPS_AGENT_MODE = previousMode;
  }
});

test("live mode fails explicitly when no API key is configured", async () => {
  const fixture = fixtures[0]!;
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    await expect(
      analyzeReport(fixture.input, { mode: "live" }),
    ).rejects.toThrow("Live agent mode requires OPENAI_API_KEY");
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test("fixture mode rejects invented evidence", async () => {
  const fixture = fixtures[0]!;
  const invalidProposal: AgentProposal = {
    ...fixture.expectedProposal,
    urgency: { ...fixture.expectedProposal.urgency, evidenceIds: ["invented-evidence"] },
  };

  await expect(
    analyzeReport(fixture.input, {
      mode: "fixture",
      fixtureProposals: new Map([[fixture.input.reportId, invalidProposal]]),
    }),
  ).rejects.toThrow("Proposal references evidence not supplied");
});

test("fixture mode rejects candidate IDs outside the supplied context", async () => {
  const fixture = fixtures[0]!;
  const invalidProposal: AgentProposal = {
    ...fixture.expectedProposal,
    catCandidates: [
      {
        catId: "cat-outside-context",
        evidenceIds: [fixture.input.textEvidenceId],
        reasons: ["Synthetic invalid proposal"],
        contradictions: [],
      },
    ],
  };

  await expect(
    analyzeReport(fixture.input, {
      mode: "fixture",
      fixtureProposals: new Map([[fixture.input.reportId, invalidProposal]]),
    }),
  ).rejects.toThrow("Proposal references a cat outside");
});

test("fixture mode supports a supplied fixture and validates matching text evidence ID", async () => {
  const fixture = fixtures[0]!;
  const fallback = await analyzeReport(fixture.input, {
    mode: "fixture",
    fixtureProposals: new Map(),
  });
  expect(fallback.uncertainties[0]).toMatch(/Deterministic fixture response/);

  await expect(
    analyzeReport(
      { ...fixture.input, textEvidenceId: "another-report" },
      { mode: "fixture", fixtureProposals: new Map() },
    ),
  ).rejects.toThrow("Text evidence ID must match the report ID");
});

test("input requires the API's PNG, colony-scoped candidate shape", async () => {
  const fixture = fixtures.find(({ id }) => id === "distinct-views-same-cat-07")!;
  await expect(
    analyzeReport(
      {
        ...fixture.input,
        context: {
          ...fixture.input.context,
          catCandidates: [{ catId: "cat-1" } as never],
        },
      },
      { mode: "fixture" },
    ),
  ).rejects.toThrow("Malformed agent intake input");

  await expect(
    analyzeReport(
      {
        ...fixture.input,
        images: [{ evidenceId: "image-1", mimeType: "image/jpeg", dataBase64: "AA==" } as never],
      },
      { mode: "fixture" },
    ),
  ).rejects.toThrow("Malformed agent intake input");
});

test("proposal validation enforces source-specific evidence and grounded cat matching", async () => {
  const fixture = fixtures.find(({ id }) => id === "distinct-views-same-cat-07")!;
  const base = fixture.expectedProposal;
  const badSource: AgentProposal = {
    ...base,
    observations: [
      {
        kind: "appearance",
        statement: "A cat is visible.",
        source: "visual",
        evidenceIds: [fixture.input.textEvidenceId],
      },
    ],
  };
  await expect(
    analyzeReport(fixture.input, {
      mode: "fixture",
      fixtureProposals: new Map([[fixture.input.reportId, badSource]]),
    }),
  ).rejects.toThrow("Visual observations must cite a supplied image");

  const badCat: AgentProposal = {
    ...base,
    catCandidates: [
      {
        catId: "cat-1",
        evidenceIds: [fixture.input.textEvidenceId],
        reasons: ["A reporter guessed this identity."],
        contradictions: [],
      },
    ],
  };
  await expect(
    analyzeReport(fixture.input, {
      mode: "fixture",
      fixtureProposals: new Map([[fixture.input.reportId, badCat]]),
    }),
  ).rejects.toThrow("Cat suggestions require a described candidate and submitted image evidence");
});
