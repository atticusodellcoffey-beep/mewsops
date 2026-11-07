import { afterEach, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AddressInfo } from "node:net";
import { createApiServer } from "../../src/app.js";
import { createDatabase, migrate, seedDemo } from "../../src/db/index.js";
import {
  syntheticFixture,
  type AnalyzeReport,
} from "../../src/api/processing.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0)) await fn();
});
async function app(
  analyze: AnalyzeReport = syntheticFixture,
  demo = true,
  vettedDemoDescriptions?: ReadonlyMap<string, string>,
) {
  const dir = await mkdtemp(join(tmpdir(), "mewsops-http-"));
  const db = createDatabase(join(dir, "test.db"));
  migrate(db);
  seedDemo(db);
  const server = createApiServer({
    db,
    uploadDir: dir,
    demo,
    analyzeReport: analyze,
    vettedDemoDescriptions,
    timeoutMs: 150,
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  cleanups.push(async () => {
    await new Promise<void>((done) => server.close(() => done()));
    db.close();
    await rm(dir, { recursive: true, force: true });
  });
  const url =
    "http://127.0.0.1:" + (server.address() as AddressInfo).port + "/api";
  const req = (
    path: string,
    cookie = "",
    body?: unknown,
    method = body === undefined ? "GET" : "POST",
  ) =>
    fetch(url + path, {
      method,
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  async function login(persona: string) {
    const res = await req("/demo/session", "", { persona });
    expect(res.status).toBe(200);
    return res.headers.get("set-cookie")!.split(";")[0];
  }
  return { req, login, url, db };
}
const input = {
  text: "Limping cat by the gate",
  selectedColonyId: "colony-1",
  clientRequestId: "phone-1",
  mediaIds: [],
};
it("takes a persisted volunteer report through scoped staff review and idempotent approval", async () => {
  const { req, login } = await app(async (input, deps) => ({
    ...((await syntheticFixture(input, deps)) as object),
    catCandidates: [
      {
        catId: "cat-1",
        evidenceIds: [input.textEvidenceId],
        reasons: ["Scripted approval test"],
        contradictions: [],
      },
    ],
  }));
  const volunteer = await login("volunteer"),
    staff = await login("staff");
  expect((await req("/reviews")).status).toBe(401);
  expect(
    (await req("/reports", volunteer, { ...input, role: "staff" })).status,
  ).toBe(400);
  const { data: report } = await (
    await req("/reports", volunteer, input)
  ).json();
  expect(report.status).toBe("received");
  expect((await (await req("/reports", volunteer, input)).json()).data.id).toBe(
    report.id,
  );
  expect(
    (await req("/reports", volunteer, { ...input, text: "changed" })).status,
  ).toBe(409);
  expect((await req("/reports", volunteer)).status).toBe(403);
  expect((await (await req("/reports", staff)).json()).data).toContainEqual(
    expect.objectContaining({ id: report.id }),
  );
  const processPath = "/reports/" + report.id + "/process";
  expect((await req(processPath, volunteer, undefined, "POST")).status).toBe(
    403,
  );
  expect((await req(processPath, staff, { reportId: "forged" })).status).toBe(
    400,
  );
  const processOnce = async () =>
    (await (await req(processPath, staff, undefined, "POST")).json()).data;
  const reviewed = await processOnce();
  expect(reviewed.reviews).toHaveLength(1);
  expect(await processOnce()).toEqual(reviewed);
  const review = reviewed.reviews[0],
    path = "/reviews/" + review.id + "/decision";
  const decision = {
    expectedVersion: review.version,
    decision: "approve",
    reason: "Matched synthetic evidence",
  };
  expect((await req(path, volunteer, decision)).status).toBe(403);
  expect(
    (await req(path, staff, { ...decision, expectedVersion: 99 })).status,
  ).toBe(409);
  const receipt = await (await req(path, staff, decision)).json();
  expect(receipt.data.catId).toBe("cat-1");
  expect(await (await req(path, staff, decision)).json()).toEqual(receipt);
  const final = await processOnce();
  expect(final.status).toBe("completed");
  expect(final.observations[0].catId).toBe("cat-1");
});
it("keeps urgent evidence through timeout and invalid agent output, then retries once", async () => {
  let calls = 0;
  const { req, login } = await app(async (r, s) => {
    calls++;
    if (calls === 1) return new Promise(() => {});
    if (calls === 2)
      return {
        ...((await syntheticFixture(r, s)) as object),
        reportId: "wrong",
      };
    return syntheticFixture(r, s);
  });
  const staff = await login("staff");
  const {
    data: { id },
  } = await (await req("/reports", staff, input)).json();
  for (let n = 0; n < 2; n++) {
    const failed = await req(
      "/reports/" + id + "/process",
      staff,
      undefined,
      "POST",
    );
    expect(failed.status).toBe(503);
    const { data } = await (await req("/reports/" + id, staff)).json();
    expect(data.status).toBe("failed");
    expect(data.observations).toHaveLength(0);
    expect(data.alerts.map((a: { level: string }) => a.level)).toEqual([
      "same_day_review",
    ]);
  }
  expect(
    (await req("/reports/" + id + "/process", staff, undefined, "POST")).status,
  ).toBe(200);
});
it("validates uploads and enforces owner and current assignment on private reads", async () => {
  let captured: Parameters<AnalyzeReport>[0] | undefined;
  const { req, url, login, db } = await app(
    async (input, deps) => {
      captured = input;
      return syntheticFixture(input, deps);
    },
    true,
    new Map([
      ["cat-1", "Test-only synthetic markings"],
      ["cat-5", "Other colony"],
    ]),
  );
  const cookie = await login("volunteer"),
    staff = await login("staff");
  const upload = (body: Buffer, contentType = "image/png") =>
    fetch(url + "/media", {
      method: "POST",
      headers: { cookie, "content-type": contentType },
      body: new Uint8Array(body),
    });
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  );
  expect((await upload(Buffer.from("bad"))).status).toBe(400);
  expect((await upload(png, "image/jpeg")).status).toBe(400);
  expect((await upload(Buffer.alloc(5 * 1024 * 1024 + 1))).status).toBe(400);
  const uploaded = await upload(png);
  expect(uploaded.status).toBe(201);
  const {
    data: { id },
  } = await uploaded.json();
  const again = await (await upload(png)).json();
  expect(again.data.id).not.toBe(id);
  const refs = db
    .prepare("SELECT DISTINCT storage_ref FROM media WHERE id IN (?,?)")
    .all(id, again.data.id);
  expect(refs).toHaveLength(1);
  const privatePath = "/media/" + id;
  expect((await req(privatePath)).status).toBe(401);
  expect((await req(privatePath, cookie)).headers.get("content-type")).toBe(
    "image/png",
  );
  const { data: report } = await (
    await req("/reports", cookie, { ...input, mediaIds: [id] })
  ).json();
  const { data: processed } = await (
    await req("/reports/" + report.id + "/process", staff, undefined, "POST")
  ).json();
  expect(processed.reviews).toEqual([]);
  expect(captured?.textEvidenceId).toBe(report.id);
  expect(captured?.images[0]).toEqual({
    evidenceId: id,
    mimeType: "image/png",
    dataBase64: Buffer.from(
      await (await req(privatePath, staff)).arrayBuffer(),
    ).toString("base64"),
  });
  expect(captured?.context.catCandidates).toContainEqual({
    catId: "cat-1",
    colonyId: "colony-1",
    knownDescription: "Test-only synthetic markings",
  });
  expect(captured?.context.catCandidates).toContainEqual({
    catId: "cat-2",
    colonyId: "colony-1",
  });
  expect(
    captured?.context.catCandidates.every((cat) => cat.colonyId === "colony-1"),
  ).toBe(true);
  db.prepare("DELETE FROM colony_assignments WHERE user_id=?").run("user-3");
  expect((await req(privatePath, cookie)).status).toBe(403);
  expect((await req(privatePath, staff)).status).toBe(200);
});
it("disables persona switching outside demo mode", async () => {
  const { req } = await app(syntheticFixture, false);
  expect((await req("/demo/session", "", { persona: "staff" })).status).toBe(
    403,
  );
});
