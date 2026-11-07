import { createServer, type IncomingMessage } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  createDatabase,
  DEMO_DATABASE_PATH,
  migrate,
  seedDemo,
  type Db,
} from "./db/index.js";
import { createServices, staff, fail } from "./domain/index.js";
import { actorFromVerifiedSession } from "./api/session.js";
import { demoAnalyzer, readDemoDescriptions } from "./api/demo-runtime.js";
import { errorEnvelope } from "./api/errors.js";
import {
  DecisionInputSchema,
  ReportInputSchema,
  ReviewSchema,
} from "./contracts/index.js";
import { saveMedia, loadMedia, maxUpload } from "./api/media.js";
import {
  processor,
  syntheticFixture,
  type AnalyzeReport,
} from "./api/processing.js";

async function bytes(req: IncomingMessage, max: number) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > max) {
      req.resume();
      fail("VALIDATION", "Request exceeds size limit");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function json(req: IncomingMessage) {
  if (req.headers["content-type"]?.split(";")[0] !== "application/json")
    fail("VALIDATION", "Expected JSON");
  const body = await bytes(req, 128 * 1024);
  try {
    return JSON.parse(body.toString("utf8")) as unknown;
  } catch {
    return fail("VALIDATION", "Invalid JSON");
  }
}
const persona = z.object({ persona: z.enum(["staff", "volunteer"]) }).strict();
export interface ApiOptions {
  db: Db;
  uploadDir: string;
  demo?: boolean;
  analyzeReport?: AnalyzeReport;
  timeoutMs?: number;
  vettedDemoDescriptions?: ReadonlyMap<string, string>;
  logRequest?: (event: { requestId: string; status: number }) => void;
  verifiedSubject?: (
    req: IncomingMessage,
  ) => Promise<{ userId: string } | undefined>;
}
export function createApiServer(options: ApiOptions) {
  const { db, uploadDir } = options;
  const services = createServices(db);
  const processReport = processor(
    db,
    services,
    options.analyzeReport,
    options.timeoutMs ?? 15000,
    uploadDir,
    options.demo ? options.vettedDemoDescriptions : undefined,
  );
  const sessions = new Map<string, { userId: string; expires: number }>();
  function project(report: ReturnType<typeof services.getReport>) {
    return {
      ...report,
      reviews: report.reviews.map((r) => ReviewSchema.parse(r)),
    };
  }
  return createServer(async (req, res) => {
    const requestId = randomUUID();
    res.once("finish", () =>
      options.logRequest?.({ requestId, status: res.statusCode }),
    );
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", "application/json");
    res.setHeader("X-Request-Id", requestId);
    const send = (data: unknown, status = 200) => {
      res.statusCode = status;
      res.end(JSON.stringify({ data }));
    };
    try {
      const path = (req.url ?? "").split("?")[0];
      const method = req.method;
      if (method === "GET" && path === "/api/health")
        return send({
          ok: true,
          analysis:
            options.analyzeReport === syntheticFixture
              ? "synthetic_fixture"
              : options.analyzeReport
                ? "adapter"
                : "unavailable",
        });
      if (
        method === "POST" &&
        req.headers.origin &&
        req.headers.origin !== "http://" + req.headers.host &&
        req.headers.origin !== "https://" + req.headers.host
      )
        fail("FORBIDDEN", "Cross-origin write denied", 403);
      const token = req.headers.cookie?.match(
        /(?:^|;\s*)mews_session=([a-f0-9]{64})(?:;|$)/,
      )?.[1];
      if (method === "POST" && path === "/api/demo/session") {
        if (
          !options.demo ||
          !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
            req.socket.remoteAddress ?? "",
          ) ||
          !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(
            req.headers.host ?? "",
          )
        )
          fail("FORBIDDEN", "Local synthetic demo only", 403);
        const { persona: name } = persona.parse(await json(req));
        const userId = name === "staff" ? "user-1" : "user-3";
        const actor = actorFromVerifiedSession(db, { userId });
        for (const [key, session] of sessions)
          if (session.expires <= Date.now() || key === token)
            sessions.delete(key);
        const key = randomBytes(32).toString("hex");
        sessions.set(key, { userId, expires: Date.now() + 3600000 });
        res.setHeader(
          "Set-Cookie",
          "mews_session=" +
            key +
            "; HttpOnly; SameSite=Strict; Path=/api; Max-Age=3600",
        );
        return send(actor);
      }
      const session = token && sessions.get(token);
      const subject =
        session && session.expires > Date.now()
          ? session
          : await options.verifiedSubject?.(req);
      if (!subject) return fail("UNAUTHORIZED", "Session required", 401);
      const actor = actorFromVerifiedSession(db, subject);
      const [, prefix, resource, id, action, ...extra] = path.split("/");
      if (prefix !== "api" || extra.length)
        return fail("NOT_FOUND", "Unknown endpoint", 404);
      if (method === "GET" && !action) {
        switch (resource) {
          case "colonies":
            return send(
              id
                ? services.getColonySummary(actor, id)
                : services.listColonies(actor),
            );
          case "reports":
            if (id) return send(project(services.getReport(actor, id)));
            staff(actor);
            return send(
              db
                .prepare(
                  "SELECT id, selected_colony_id AS colonyId, received_at AS receivedAt, text, status FROM reports ORDER BY received_at DESC, id",
                )
                .all(),
            );
          case "cats":
            if (id) return send(services.getCat(actor, id));
            break;
          case "reviews":
            if (!id)
              return send(
                services.listReviews(actor).map((r) => ReviewSchema.parse(r)),
              );
            break;
          case "alerts":
            if (!id) return send(services.listAlerts(actor));
            break;
          case "summary":
            if (!id) return send(services.getAggregateReport(actor));
            break;
          case "media":
            if (id) {
              const data = await loadMedia(db, uploadDir, actor, id);
              res.setHeader("Content-Type", "image/png");
              res.end(data);
              return;
            }
        }
      }
      if (method === "POST") {
        if (resource === "reports" && !id && !action) {
          const report = services.submitReport(
            actor,
            ReportInputSchema.parse(await json(req)),
          );
          return send(project(services.getReport(actor, report.id)), 201);
        }
        if (resource === "reports" && id && action === "process") {
          await bytes(req, 0);
          return send(project(await processReport(actor, id)));
        }
        if (resource === "alerts" && id && action === "resolve") {
          staff(actor);
          const { reason } = z
            .object({ reason: z.string().trim().min(1).max(2000) })
            .strict()
            .parse(await json(req));
          return send(services.resolveAlert(actor, id, reason));
        }
        if (resource === "reviews" && id && action === "decision") {
          staff(actor);
          return send(
            services.decideReview(
              actor,
              id,
              DecisionInputSchema.parse(await json(req)),
            ),
          );
        }
        if (resource === "media" && !id && !action)
          return send(
            await saveMedia(
              db,
              uploadDir,
              actor,
              await bytes(req, maxUpload),
              req.headers["content-type"] ?? "",
            ),
            201,
          );
      }
      fail("NOT_FOUND", "Unknown endpoint", 404);
    } catch (error) {
      const failure =
        error instanceof z.ZodError
          ? {
              status: 400,
              body: {
                error: {
                  code: "VALIDATION",
                  message: "Malformed request",
                  requestId,
                },
              },
            }
          : errorEnvelope(error, requestId);
      res.statusCode = failure.status;
      res.end(JSON.stringify(failure.body));
    }
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  if (process.env.MEWSOPS_DEMO !== "1")
    throw new Error("Set MEWSOPS_DEMO=1 for local synthetic startup");
  const analyzeReport = await demoAnalyzer(process.env.MEWSOPS_ANALYSIS);
  const vettedDemoDescriptions = await readDemoDescriptions();
  const db = createDatabase(DEMO_DATABASE_PATH);
  migrate(db);
  seedDemo(db);
  createApiServer({
    db,
    uploadDir: resolve("storage/uploads"),
    demo: true,
    analyzeReport,
    vettedDemoDescriptions,
    logRequest: (event) => console.info(JSON.stringify(event)),
  }).listen(3000, "127.0.0.1", () =>
    console.log("Synthetic API at http://127.0.0.1:3000"),
  );
}
