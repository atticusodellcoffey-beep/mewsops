import type { Db, Tables, Cat } from "./types.js";
export function repositories(db: Db) {
  function table<K extends keyof Tables>(name: K) {
    const columns = new Set(
      (
        db.prepare(`PRAGMA table_info(${name})`).all() as { name: string }[]
      ).map((c) => c.name),
    );
    return {
      get: (id: string) =>
        db.prepare(`SELECT * FROM ${name} WHERE id=?`).get(id) as
          | Tables[K]
          | undefined,
      list: () =>
        db.prepare(`SELECT * FROM ${name} ORDER BY id`).all() as Tables[K][],
      insert: (row: Tables[K]) => {
        const keys = Object.keys(row);
        if (keys.some((k) => !columns.has(k)))
          throw new Error("Unknown column");
        db.prepare(
          `INSERT INTO ${name} (${keys.join(",")}) VALUES (${keys.map((k) => "@" + k).join(",")})`,
        ).run(row);
      },
    };
  }
  const cats = table("cats");
  function canonicalId(id: string): string {
    if (!cats.get(id)) throw new Error("Cat not found");
    const visited = new Set<string>();
    while (true) {
      if (visited.has(id)) throw new Error("Alias cycle");
      visited.add(id);
      const alias = db
        .prepare(
          "SELECT canonical_cat_id FROM merge_aliases WHERE alias_cat_id=? AND reversed_at IS NULL",
        )
        .get(id) as { canonical_cat_id: string } | undefined;
      if (!alias) return id;
      id = alias.canonical_cat_id;
    }
  }
  function staff(id: string) {
    if (table("users").get(id)?.role !== "staff")
      throw new Error("Staff actor required");
  }
  type MergeInput = {
    id: string;
    aliasCatId: string;
    canonicalCatId: string;
    actorId: string;
    reason: string;
    at: string;
  };
  function audit(
    i: Omit<MergeInput, "canonicalCatId">,
    action: string,
    before: unknown,
    after: unknown,
  ) {
    table("audit_events").insert({
      id: i.id,
      actor_id: i.actorId,
      action,
      entity_type: "cat",
      entity_id: i.aliasCatId,
      before_json: JSON.stringify(before),
      after_json: JSON.stringify(after),
      reason: i.reason,
      created_at: i.at,
    });
  }
  return {
    users: table("users"),
    colonies: table("colonies"),
    reports: table("reports"),
    media: table("media"),
    observations: table("observations"),
    alerts: table("alerts"),
    review_requests: table("review_requests"),
    feeding_visits: table("feeding_visits"),
    audit_events: table("audit_events"),
    merge_aliases: table("merge_aliases"),
    cats: {
      ...cats,
      canonicalId,
      countByColony: (colonyId: string) => {
        const roots = new Map<string, Cat>();
        for (const cat of cats.list()) {
          const root = cats.get(canonicalId(cat.id))!;
          if (root.colony_id === colonyId) roots.set(root.id, root);
        }
        const active = [...roots.values()].filter(
          (c) => c.lifecycle === "active",
        );
        const confirmed = active.filter((c) => c.identity_confirmed === 1);
        return {
          confirmed: confirmed.length,
          pending: active.filter((c) => !c.identity_confirmed).length,
          fixed: confirmed.filter((c) => c.sterilization === "fixed").length,
          notFixed: confirmed.filter((c) => c.sterilization === "not_fixed")
            .length,
          unknown: confirmed.filter((c) => c.sterilization === "unknown")
            .length,
        };
      },
    },
    assignments: {
      listForUser: (id: string) =>
        db
          .prepare(
            "SELECT colony_id FROM colony_assignments WHERE user_id=? ORDER BY colony_id",
          )
          .all(id) as { colony_id: string }[],
      assign: (userId: string, colonyId: string) => {
        db.prepare("INSERT INTO colony_assignments VALUES (?,?)").run(
          userId,
          colonyId,
        );
      },
    },
    transaction: <T>(fn: () => T): T => db.transaction(fn).immediate(),
    merges: {
      merge: (i: MergeInput) =>
        db
          .transaction(() => {
            staff(i.actorId);
            if (!i.reason.trim()) throw new Error("Reason required");
            const source = cats.get(i.aliasCatId),
              target = cats.get(i.canonicalCatId);
            if (
              !source ||
              !target ||
              source.id === target.id ||
              source.colony_id !== target.colony_id
            )
              throw new Error("Invalid merge target");
            const involved = db
              .prepare(
                "SELECT 1 FROM merge_aliases WHERE reversed_at IS NULL AND (alias_cat_id IN (?,?) OR canonical_cat_id=?)",
              )
              .get(source.id, target.id, source.id);
            if (involved) throw new Error("Merge chains are not supported");
            table("merge_aliases").insert({
              id: i.id,
              alias_cat_id: source.id,
              canonical_cat_id: target.id,
              created_by: i.actorId,
              created_at: i.at,
              reversed_by: null,
              reversed_at: null,
              reason: i.reason,
              review_id: null,
              snapshot: JSON.stringify(source),
              after_version: source.version + 1,
            });
            db.prepare("UPDATE cats SET version=version+1 WHERE id=?").run(
              source.id,
            );
            audit(i, "merge_cats", source, { canonicalId: target.id });
          })
          .immediate(),
      reverse: (i: Omit<MergeInput, "canonicalCatId">) =>
        db
          .transaction(() => {
            staff(i.actorId);
            if (!i.reason.trim()) throw new Error("Reason required");
            const alias = db
              .prepare(
                "SELECT * FROM merge_aliases WHERE alias_cat_id=? AND reversed_at IS NULL",
              )
              .get(i.aliasCatId) as Tables["merge_aliases"] | undefined;
            if (!alias) throw new Error("Active merge not found");
            if (cats.get(i.aliasCatId)?.version !== alias.after_version)
              throw new Error("Cat changed after merge");
            db.prepare(
              "UPDATE merge_aliases SET reversed_by=?,reversed_at=? WHERE id=?",
            ).run(i.actorId, i.at, alias.id);
            db.prepare("UPDATE cats SET version=version+1 WHERE id=?").run(
              i.aliasCatId,
            );
            audit(i, "reverse_merge", alias, { canonicalId: i.aliasCatId });
          })
          .immediate(),
    },
  };
}
