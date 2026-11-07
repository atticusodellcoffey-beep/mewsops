import type { Db } from "../db/types.js";
import { createSqlitePort } from "./sqlite.js";
import { createDomainServices } from "./services.js";
export { createDomainServices } from "./services.js";
export * from "./types.js";
export type * from "./port.js";
export function createServices(db: Db) {
  return createDomainServices(createSqlitePort(db));
}
