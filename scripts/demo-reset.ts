import { existsSync, lstatSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createDatabase,
  DEMO_DATABASE_PATH,
  migrate,
  seedDemo,
} from "../src/db/index.js";
/** Transactional reset only of our marked demo DB. No unlink, arbitrary paths, or unrelated files. */
export function resetDemo(args: string[]): void {
  if (args.length !== 1 || args[0] !== "--confirm-demo-reset")
    throw new Error(
      "Required: --confirm-demo-reset; custom database paths are forbidden",
    );
  let parent = DEMO_DATABASE_PATH;
  while (true) {
    if (existsSync(parent) && lstatSync(parent).isSymbolicLink())
      throw new Error("Symlink demo path refused");
    const next = dirname(parent);
    if (next === parent) break;
    parent = next;
  }
  if (
    existsSync(DEMO_DATABASE_PATH) &&
    (!lstatSync(DEMO_DATABASE_PATH).isFile() ||
      lstatSync(DEMO_DATABASE_PATH).nlink !== 1)
  )
    throw new Error("Demo path must be a regular file without hard links");
  mkdirSync(dirname(DEMO_DATABASE_PATH), { recursive: true });
  const existed = existsSync(DEMO_DATABASE_PATH);
  const db = createDatabase(DEMO_DATABASE_PATH);
  try {
    if (existed) {
      const marker = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='demo_seed'",
        )
        .get();
      if (
        !marker ||
        !db.prepare("SELECT 1 FROM demo_seed WHERE id='mewsops-v1'").get()
      )
        throw new Error("Refusing to reset database without demo seed marker");
    }
    db.pragma("foreign_keys = OFF");
    db.transaction(() => {
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        )
        .all() as { name: string }[];
      const allowed = new Set([
        "schema_migrations",
        "demo_seed",
        "users",
        "colonies",
        "colony_assignments",
        "cats",
        "reports",
        "media",
        "observations",
        "feeding_visits",
        "alerts",
        "review_requests",
        "audit_events",
        "merge_aliases",
      ]);
      if (tables.some((t) => !allowed.has(t.name)))
        throw new Error("Unexpected tables; refusing demo reset");
      for (const t of tables) db.exec(`DROP TABLE "${t.name}"`);
      migrate(db);
      seedDemo(db);
      if ((db.pragma("foreign_key_check") as unknown[]).length)
        throw new Error("Reset foreign key check failed");
    }).immediate();
  } finally {
    db.pragma("foreign_keys = ON");
    db.close();
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    resetDemo(process.argv.slice(2));
    console.log(`Reset synthetic demo database: ${DEMO_DATABASE_PATH}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Demo reset failed");
    process.exitCode = 1;
  }
}
