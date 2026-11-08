import sharp from "sharp";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { repositories, type Db } from "../db/index.js";
import { fail, type Actor } from "../domain/types.js";
import { createServices } from "../domain/index.js";

const png = Buffer.from("89504e470d0a1a0a", "hex");
export const maxUpload = 5 * 1024 * 1024;

export async function saveMedia(
  db: Db,
  dir: string,
  actor: Actor,
  body: Buffer,
  mime: string,
) {
  const jpeg = body[0] === 255 && body[1] === 216 && body[2] === 255;
  if (
    !(jpeg && mime === "image/jpeg") &&
    !(body.subarray(0, 8).equals(png) && mime === "image/png")
  )
    fail("VALIDATION", "Expected a JPEG or PNG matching its content type");
  const decoder = sharp(body, {
    limitInputPixels: 16_000_000,
    failOn: "warning",
  });
  let clean: Buffer;
  try {
    const info = await decoder.metadata();
    if (
      !info.width ||
      !info.height ||
      info.width > 8192 ||
      info.height > 8192 ||
      (info.pages ?? 1) > 1
    )
      throw new Error();
    clean = await decoder.autoOrient().png().toBuffer();
  } catch {
    return fail("VALIDATION", "Invalid or oversized image");
  }
  const sha256 = createHash("sha256").update(body).digest("hex");
  const filename = sha256 + ".png";
  const id = randomUUID();
  await mkdir(dir, { recursive: true });
  const temp = join(dir, id + ".tmp");
  try {
    await writeFile(temp, clean, { flag: "wx", mode: 0o600 });
    await rename(temp, join(dir, filename));
  } finally {
    await rm(temp, { force: true });
  }
  repositories(db).media.insert({
    id,
    uploaded_by: actor.id,
    report_id: null,
    storage_ref: filename,
    sha256,
    available: 1,
    created_at: new Date().toISOString(),
  });
  return { id, contentType: "image/png" };
}

export async function loadMedia(db: Db, dir: string, actor: Actor, id: string) {
  const row = repositories(db).media.get(id);
  if (!row) return fail("NOT_FOUND", "Media not found", 404);
  if (actor.role !== "staff" && row.uploaded_by !== actor.id)
    fail("FORBIDDEN", "Private media", 403);
  if (row.report_id) createServices(db).getReport(actor, row.report_id);
  if (!row.available || !/^[0-9a-f]{64}\.png$/.test(row.storage_ref))
    return fail("UNAVAILABLE", "Media unavailable", 503);
  try {
    return await readFile(join(dir, row.storage_ref));
  } catch {
    return fail("UNAVAILABLE", "Media unavailable", 503);
  }
}
