const baseUrl = process.env.MEWSOPS_BASE_URL || "http://127.0.0.1:3000";

async function jsonRequest(
  path: string,
  options: { method?: string; cookie?: string; body?: unknown } = {},
) {
  const response = await fetch(new URL(path, baseUrl), {
    method: options.method ?? "GET",
    headers: {
      ...(options.cookie && { cookie: options.cookie }),
      ...(options.body !== undefined && { "content-type": "application/json" }),
    },
    ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
  });
  let payload: any;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Expected JSON response from ${path} (HTTP ${response.status})`);
  }
  if (!response.ok)
    throw new Error(
      `${path} failed with HTTP ${response.status} (${payload?.error?.code ?? "unknown"})`,
    );
  return payload.data;
}

async function login(persona: "staff" | "volunteer"): Promise<string> {
  const response = await fetch(new URL("/api/demo/session", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ persona }),
  });
  if (!response.ok) throw new Error(`Demo ${persona} session failed (HTTP ${response.status})`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error(`Demo ${persona} session did not return a cookie`);
  return cookie;
}

const health = await jsonRequest("/api/health");
if (health.analysis !== "adapter")
  throw new Error(`Expected API health analysis=adapter; got ${health.analysis}`);
const volunteer = await login("volunteer");
const staff = await login("staff");
const clientRequestId = `agent-live-${Date.now()}`;
const report = await jsonRequest("/api/reports", {
  method: "POST",
  cookie: volunteer,
  body: {
    clientRequestId,
    selectedColonyId: "colony-1",
    text: "At Mangrove Lantern, I saw a cat limping near the feeding area. Please have staff check the report.",
    mediaIds: [],
  },
});
const processed = await jsonRequest(`/api/reports/${report.id}/process`, {
  method: "POST",
  cookie: staff,
});
const reporterObservations = processed.observations.filter(
  (observation: { source?: string; evidenceIds?: string[] }) =>
    observation.source === "reporter" &&
    observation.evidenceIds?.includes(report.id),
);
if (!reporterObservations.length)
  throw new Error("Live API result had no reporter observation tied to the report ID");

console.log(
  JSON.stringify(
    {
      run: "live Agents SDK through Teammate 4 API adapter",
      health: health.analysis,
      reportId: report.id,
      reportStatus: processed.status,
      urgency: processed.alerts?.map((alert: { level: string }) => alert.level) ?? [],
      reporterObservations: reporterObservations.map(
        (observation: { kind: string; statement: string; evidenceIds: string[] }) => ({
          kind: observation.kind,
          statement: observation.statement,
          evidenceIds: observation.evidenceIds,
        }),
      ),
      catReviewCount: processed.reviews?.length ?? 0,
      catIdentity: "unresolved: no photo or vetted candidate appearance descriptions supplied",
    },
    null,
    2,
  ),
);
