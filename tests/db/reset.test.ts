import { afterAll, describe, it, expect, vi } from "vitest";
import {
  realpathSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const state = vi.hoisted(() => ({ path: "" }));
vi.mock("../../src/db/index.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  get DEMO_DATABASE_PATH() {
    return state.path;
  },
}));
import { resetDemo } from "../../scripts/demo-reset.js";
import { createDatabase } from "../../src/db/index.js";
const dir = realpathSync(mkdtempSync(join(tmpdir(), "mewsops-reset-test-")));
state.path = join(dir, "demo.db");
afterAll(() => rmSync(dir, { recursive: true, force: true }));
describe("guarded actual SQLite reset", () => {
  it("creates and resets a marked demo without affecting adjacent files", () => {
    writeFileSync(join(dir, "keep.txt"), "keep");
    resetDemo(["--confirm-demo-reset"]);
    let db = createDatabase(state.path);
    db.prepare("UPDATE cats SET name='Changed' WHERE id='cat-1'").run();
    db.close();
    resetDemo(["--confirm-demo-reset"]);
    db = createDatabase(state.path);
    expect(db.prepare("SELECT name FROM cats WHERE id='cat-1'").get()).toEqual({
      name: "Pebble",
    });
    expect(db.pragma("foreign_key_check")).toEqual([]);
    db.close();
    expect(readFileSync(join(dir, "keep.txt"), "utf8")).toBe("keep");
  });
  it("refuses unmarked SQLite and symlinks without changing target", () => {
    const original = state.path;
    state.path = join(dir, "non-demo.db");
    const db = createDatabase(state.path);
    db.exec("CREATE TABLE important (value TEXT)");
    db.close();
    const before = readFileSync(state.path);
    expect(() => resetDemo(["--confirm-demo-reset"])).toThrow("marker");
    expect(readFileSync(state.path)).toEqual(before);
    const target = state.path;
    state.path = join(dir, "linked.db");
    symlinkSync(target, state.path);
    expect(() => resetDemo(["--confirm-demo-reset"])).toThrow("Symlink");
    state.path = original;
  });
});
