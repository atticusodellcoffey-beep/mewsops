import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
export type * from "./types.js";
export { migrate } from "./migrations.js";
export { seedDemo } from "./seed.js";
export { repositories } from "./repositories.js";
export const DEMO_DATABASE_PATH = fileURLToPath(
  new URL("../../storage/mewsops-demo.db", import.meta.url),
);
export function createDatabase(path: string): Database.Database {
  if (path === DEMO_DATABASE_PATH)
    mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("foreign_keys = ON");
  db.pragma("recursive_triggers = ON");
  db.pragma("busy_timeout = 5000");
  return db;
}
