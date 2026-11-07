import type { Db } from "../db/types.js";
import type { Actor } from "../domain/types.js";
import { fail } from "../domain/types.js";

/** Converts a verified session subject into authority. Never pass client role/scope fields here. */
export function actorFromVerifiedSession(
  db: Db,
  verifiedSubject: { userId: string },
): Actor {
  if (!verifiedSubject?.userId)
    fail("UNAUTHORIZED", "Verified session required", 401);
  const user = db
    .prepare("SELECT id, role FROM users WHERE id=? AND available=1")
    .get(verifiedSubject.userId) as
    | { id: string; role: "staff" | "volunteer" }
    | undefined;
  if (!user) fail("UNAUTHORIZED", "Session user is unavailable", 401);
  const assignedColonyIds =
    user.role === "staff"
      ? []
      : (
          db
            .prepare(
              "SELECT colony_id FROM colony_assignments WHERE user_id=? ORDER BY colony_id",
            )
            .all(user.id) as { colony_id: string }[]
        ).map((x) => x.colony_id);
  return { id: user.id, role: user.role, assignedColonyIds };
}
