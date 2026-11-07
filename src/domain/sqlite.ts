import type { Db, Tables } from "../db/types.js";
import type { DomainPort, Entities, Cat, Review } from "./port.js";

const tableNames = {
  colonies: "colonies",
  cats: "cats",
  reports: "reports",
  media: "media",
  observations: "observations",
  reviews: "review_requests",
  alerts: "alerts",
  visits: "feeding_visits",
  merges: "merge_aliases",
  audit: "audit_events",
  proposalReceipts: "proposal_receipts",
} as const;

/** Internal relational adapter. Services own authorization; no parallel JSON store. */
export function createSqlitePort(db: Db): DomainPort {
  const now = () => new Date().toISOString();
  const json = (value: unknown) => JSON.stringify(value);
  function read<K extends keyof Tables>(
    table: K,
    id: string,
  ): Tables[K] | undefined {
    return db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id) as
      | Tables[K]
      | undefined;
  }
  function canonical(id: string): string | null {
    let current = id;
    const seen = new Set<string>();
    while (true) {
      if (seen.has(current)) throw new Error("Invalid cat alias cycle");
      seen.add(current);
      const next = db
        .prepare(
          "SELECT canonical_cat_id FROM merge_aliases WHERE alias_cat_id=? AND reversed_at IS NULL",
        )
        .get(current) as { canonical_cat_id: string } | undefined;
      if (!next) return current === id ? null : current;
      current = next.canonical_cat_id;
    }
  }
  function mapCat(row: Tables["cats"]): Cat {
    return {
      id: row.id,
      colonyId: row.colony_id,
      name: row.name,
      lifecycle: row.lifecycle,
      sterilization: row.sterilization,
      confirmed: row.identity_confirmed === 1,
      canonicalId: canonical(row.id),
      version: row.version,
      vetReviewStatus: row.vet_review_status,
    };
  }
  function decode<K extends keyof Entities>(
    table: K,
    raw: unknown,
  ): Entities[K] {
    // Each case reads one fixed internal table; user input never chooses SQL identifiers.
    let result: unknown;
    switch (table) {
      case "colonies": {
        const r = raw as Tables["colonies"];
        result = { id: r.id, name: r.name, exactLocation: r.exact_location };
        break;
      }
      case "cats":
        result = mapCat(raw as Tables["cats"]);
        break;
      case "reports": {
        const r = raw as Tables["reports"];
        result = {
          id: r.id,
          actorId: r.actor_id,
          clientRequestId: r.client_request_id,
          text: r.text,
          selectedColonyId: r.selected_colony_id ?? undefined,
          colonyId: r.selected_colony_id,
          mediaIds: (
            db
              .prepare("SELECT id FROM media WHERE report_id=? ORDER BY id")
              .all(r.id) as { id: string }[]
          ).map((m) => m.id),
          demoLocationId: r.demo_location_id ?? undefined,
          observedAt: r.observed_at ?? undefined,
          receivedAt: r.received_at,
          status: r.status,
        };
        break;
      }
      case "media": {
        const r = raw as Tables["media"];
        result = { id: r.id, ownerId: r.uploaded_by, reportId: r.report_id };
        break;
      }
      case "observations": {
        const r = raw as Tables["observations"];
        result = {
          id: r.id,
          reportId: r.report_id,
          catId: r.cat_id,
          kind: r.kind,
          statement: r.statement,
          source: r.source,
          evidenceIds: JSON.parse(r.evidence_ids),
        };
        break;
      }
      case "reviews": {
        const r = raw as Tables["review_requests"];
        const change = JSON.parse(r.proposed_change);
        result = {
          id: r.id,
          reportId: r.report_id,
          colonyId:
            change.colonyId ?? read("reports", r.report_id)?.selected_colony_id,
          action: r.action,
          status: r.status,
          version: r.version,
          proposedChange: change,
          evidenceIds: JSON.parse(r.evidence_ids),
          targetSnapshot: JSON.parse(r.target_snapshot),
          receipt: r.receipt ? JSON.parse(r.receipt) : undefined,
        };
        break;
      }
      case "alerts": {
        const r = raw as Tables["alerts"];
        result = {
          id: r.id,
          reportId: r.report_id,
          colonyId: r.colony_id,
          level: r.level,
          statement: (JSON.parse(r.reasons) as string[]).join("; "),
          verified: false,
          createdAt: r.created_at,
          status: r.status,
          evidenceIds: JSON.parse(r.evidence_ids),
        };
        break;
      }
      case "visits": {
        const r = raw as Tables["feeding_visits"];
        result = {
          id: r.id,
          actorId: r.feeder_id,
          clientRequestId: r.client_request_id,
          colonyId: r.colony_id,
          occurredAt: r.occurred_at,
          receivedAt: r.recorded_at,
          evidence: r.evidence,
        };
        break;
      }
      case "merges": {
        const r = raw as Tables["merge_aliases"];
        result = {
          id: r.id,
          sourceId: r.alias_cat_id,
          targetId: r.canonical_cat_id,
          reviewId: r.review_id,
          before: r.snapshot ? JSON.parse(r.snapshot) : undefined,
          afterVersion: r.after_version,
          reversed: r.reversed_at !== null,
          actorId: r.created_by,
          reason: r.reason,
          at: r.created_at,
          reversedBy: r.reversed_by ?? undefined,
          reversedAt: r.reversed_at ?? undefined,
        };
        break;
      }
      case "audit": {
        const r = raw as Tables["audit_events"];
        result = {
          id: r.id,
          actorId: r.actor_id,
          action: r.action,
          entityId: r.entity_id,
          at: r.created_at,
          detail: r.after_json ? JSON.parse(r.after_json) : null,
        };
        break;
      }
      case "proposalReceipts": {
        const r = raw as {
          id: string;
          report_id: string;
          payload_hash: string;
          review_ids: string;
          result_json: string;
          created_at: string;
        };
        result = {
          id: r.id,
          reportId: r.report_id,
          payloadHash: r.payload_hash,
          reviewIds: JSON.parse(r.review_ids),
          result: JSON.parse(r.result_json),
          createdAt: r.created_at,
        };
        break;
      }
    }
    return result as Entities[K];
  }
  function insert(table: string, row: Record<string, unknown>) {
    const keys = Object.keys(row);
    db.prepare(
      `INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map((k) => "@" + k).join(",")})`,
    ).run(row);
  }
  const port: DomainPort = {
    transaction: (work) => db.transaction(work).immediate(),
    get: (table, id) => {
      const raw = db
        .prepare(`SELECT * FROM ${tableNames[table]} WHERE id=?`)
        .get(id);
      return raw ? decode(table, raw) : undefined;
    },
    all: (table) =>
      db
        .prepare(`SELECT * FROM ${tableNames[table]} ORDER BY id`)
        .all()
        .map((raw) => decode(table, raw)),
    put(table, value) {
      const exists = !!db
        .prepare(`SELECT 1 FROM ${tableNames[table]} WHERE id=?`)
        .get(value.id);
      switch (table) {
        case "colonies":
          throw new Error(
            "Colony configuration is not a domain write operation",
          );
        case "cats": {
          const r = value as Entities["cats"];
          if (exists)
            db.prepare(
              "UPDATE cats SET name=?,lifecycle=?,sterilization=?,identity_confirmed=?,version=? WHERE id=?",
            ).run(
              r.name,
              r.lifecycle,
              r.sterilization,
              +r.confirmed,
              r.version,
              r.id,
            );
          else
            insert("cats", {
              id: r.id,
              colony_id: r.colonyId,
              name: r.name,
              lifecycle: r.lifecycle,
              sterilization: r.sterilization,
              identity_confirmed: +r.confirmed,
              vet_review_status: "none",
              version: r.version,
              created_at: now(),
            });
          break;
        }
        case "reports": {
          const r = value as Entities["reports"];
          if (exists)
            db.prepare("UPDATE reports SET status=? WHERE id=?").run(
              r.status,
              r.id,
            );
          else
            insert("reports", {
              id: r.id,
              actor_id: r.actorId,
              client_request_id: r.clientRequestId,
              text: r.text,
              selected_colony_id: r.colonyId,
              demo_location_id: r.demoLocationId ?? null,
              observed_at: r.observedAt ?? null,
              received_at: r.receivedAt,
              status: r.status,
            });
          break;
        }
        case "media": {
          const r = value as Entities["media"];
          if (!exists)
            throw new Error(
              "Media must be registered by upload infrastructure before report submission",
            );
          db.prepare("UPDATE media SET report_id=? WHERE id=?").run(
            r.reportId,
            r.id,
          );
          break;
        }
        case "observations": {
          const r = value as Entities["observations"];
          if (exists)
            db.prepare("UPDATE observations SET cat_id=? WHERE id=?").run(
              r.catId,
              r.id,
            );
          else
            insert("observations", {
              id: r.id,
              report_id: r.reportId,
              cat_id: r.catId,
              kind: r.kind,
              statement: r.statement,
              source: r.source,
              evidence_ids: json(r.evidenceIds),
              observed_at: read("reports", r.reportId)?.observed_at ?? null,
              created_at: now(),
            });
          break;
        }
        case "reviews": {
          const r = value as Review;
          if (exists) {
            const input = r.receipt?.input as { reason?: string } | undefined;
            db.prepare(
              "UPDATE review_requests SET status=?,version=?,receipt=?,decided_by=?,decided_at=?,decision_reason=? WHERE id=?",
            ).run(
              r.status,
              r.version,
              r.receipt ? json(r.receipt) : null,
              r.receipt?.actorId ?? null,
              r.receipt ? now() : null,
              input?.reason ?? null,
              r.id,
            );
          } else {
            if (!r.colonyId || !read("colonies", r.colonyId))
              throw new Error("Review must have an existing colony scope");
            if (
              r.proposedChange.colonyId !== undefined &&
              r.proposedChange.colonyId !== r.colonyId
            )
              throw new Error("Review proposal scope mismatch");
            insert("review_requests", {
              id: r.id,
              report_id: r.reportId,
              action: r.action,
              status: r.status,
              version: r.version,
              proposed_change: json({
                ...r.proposedChange,
                colonyId: r.colonyId,
              }),
              evidence_ids: json(r.evidenceIds),
              target_snapshot: json(r.targetSnapshot),
              receipt: null,
              created_at: now(),
              decided_by: null,
              decided_at: null,
              decision_reason: null,
            });
          }
          break;
        }
        case "alerts": {
          const r = value as Entities["alerts"];
          if (exists) {
            db.prepare(
              "UPDATE alerts SET level=?, reasons=?, evidence_ids=? WHERE id=?",
            ).run(
              r.level,
              json([r.statement]),
              json(r.evidenceIds ?? [r.reportId]),
              r.id,
            );
            break;
          }
          insert("alerts", {
            id: r.id,
            report_id: r.reportId,
            colony_id: r.colonyId,
            level: r.level,
            reasons: json([r.statement]),
            evidence_ids: json(r.evidenceIds ?? [r.reportId]),
            status: r.status ?? "open",
            created_at: r.createdAt,
          });
          break;
        }
        case "visits": {
          const r = value as Entities["visits"];
          if (exists) throw new Error("Feeding visits are immutable");
          insert("feeding_visits", {
            id: r.id,
            colony_id: r.colonyId,
            feeder_id: r.actorId,
            report_id: null,
            occurred_at: r.occurredAt,
            recorded_at: r.receivedAt,
            confirmed_by: r.actorId,
            client_request_id: r.clientRequestId,
            evidence: r.evidence,
          });
          break;
        }
        case "merges": {
          const r = value as Entities["merges"];
          if (exists) {
            if (!r.reversed || !r.reversedBy || !r.reversedAt)
              throw new Error("Merge reversal needs a reviewer and timestamp");
            db.prepare(
              "UPDATE merge_aliases SET reversed_by=?,reversed_at=? WHERE id=?",
            ).run(r.reversedBy, r.reversedAt, r.id);
          } else {
            if (!r.actorId || !r.reason || !r.at)
              throw new Error("Merge needs a reviewer, reason and timestamp");
            insert("merge_aliases", {
              id: r.id,
              alias_cat_id: r.sourceId,
              canonical_cat_id: r.targetId,
              created_by: r.actorId,
              created_at: r.at,
              reversed_by: null,
              reversed_at: null,
              reason: r.reason,
              review_id: r.reviewId,
              snapshot: json(r.before),
              after_version: r.afterVersion,
            });
          }
          break;
        }
        case "audit": {
          const r = value as Entities["audit"];
          if (exists) throw new Error("Audit history is append-only");
          insert("audit_events", {
            id: r.id,
            actor_id: r.actorId,
            action: r.action,
            entity_type: "domain",
            entity_id: r.entityId,
            before_json: null,
            after_json: json(r.detail ?? null),
            reason: r.action,
            created_at: r.at,
          });
          break;
        }
        case "proposalReceipts": {
          const r = value as Entities["proposalReceipts"];
          if (exists) throw new Error("Proposal receipt already exists");
          insert("proposal_receipts", {
            id: r.id,
            report_id: r.reportId,
            payload_hash: r.payloadHash,
            review_ids: json(r.reviewIds),
            result_json: json(r.result),
            created_at: r.createdAt,
          });
          break;
        }
      }
    },
  };
  return port;
}
