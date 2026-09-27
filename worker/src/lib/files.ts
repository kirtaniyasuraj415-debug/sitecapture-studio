import { randomUUID } from "node:crypto";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

export const TEMP_DIR = path.resolve(process.env.TEMP_DIR || "./temp");
export const FILE_TTL_MS = Number(process.env.FILE_TTL_MS || 30 * 60 * 1000);

export async function ensureTemp() { await mkdir(TEMP_DIR, { recursive: true }); }
export function newFile(ext: string) { const id = randomUUID(); return { id, path: path.join(TEMP_DIR, `${id}.${ext}`), name: `${id}.${ext}` }; }
export async function findFile(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const entries = await readdir(TEMP_DIR);
  const name = entries.find((entry) => entry.startsWith(`${id}.`));
  return name ? path.join(TEMP_DIR, name) : null;
}
export async function cleanupFiles() {
  await ensureTemp();
  const now = Date.now();
  for (const entry of await readdir(TEMP_DIR)) {
    if (entry === ".gitkeep") continue;
    const file = path.join(TEMP_DIR, entry);
    try { if (now - (await stat(file)).mtimeMs > FILE_TTL_MS) await rm(file, { force: true, recursive: true }); } catch {}
  }
}
