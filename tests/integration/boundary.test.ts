import { describe, expect, it } from "vitest";
import { createDatabase, migrate, seedDemo } from "../../src/db/index.js";
import { actorFromVerifiedSession } from "../../src/api/session.js";
import { errorEnvelope } from "../../src/api/errors.js";

describe("transport boundary helpers", () => {
  it("derives role and assignments from the database, ignoring client authority fields", () => {
    const db = createDatabase(":memory:");
    try {
      migrate(db);
      seedDemo(db);
      const actor = actorFromVerifiedSession(db, { userId: "user-3" });
      expect(actor).toEqual({
        id: "user-3",
        role: "volunteer",
        assignedColonyIds: ["colony-1"],
      });
    } finally {
      db.close();
    }
  });
  it("redacts unexpected errors", () => {
    const result = errorEnvelope(new Error("secret SQL path"), "req-1");
    expect(result).toEqual({
      status: 500,
      body: {
        error: {
          code: "INTERNAL_ERROR",
          message: "Internal server error",
          requestId: "req-1",
        },
      },
    });
  });
});
