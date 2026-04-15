import { promises as fs } from "fs";
import path from "path";

const ROOT = process.cwd();
export const SOURCES_DIR = path.join(ROOT, "sources");
export const RAW_SOURCES_DIR = path.join(ROOT, "raw_sources");
export const WIKI_DIR = path.join(ROOT, "wiki");

export function safeFilename(name: string): string {
  const base = (name || "").replace(/[\\/\x00-\x1f]+/g, "_").replace(/^\.+/, "").trim();
  return base.slice(0, 200) || `file-${Date.now()}`;
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeUnique(dir: string, filename: string, data: Buffer | string): Promise<string> {
  await ensureDir(dir);
  const ext = path.extname(filename);
  const stem = path.basename(filename, ext);
  let candidate = filename;
  let i = 1;
  while (true) {
    const full = path.join(dir, candidate);
    try {
      await fs.access(full);
      candidate = `${stem}-${i}${ext}`;
      i++;
    } catch {
      await fs.writeFile(full, data);
      return full;
    }
  }
}

export async function saveOriginalSource(filename: string, base64: string): Promise<string> {
  const buf = Buffer.from(base64, "base64");
  return writeUnique(SOURCES_DIR, safeFilename(filename), buf);
}

export async function saveRawSourceMarkdown(filename: string, markdown: string): Promise<string> {
  const name = safeFilename(filename).replace(/\.[a-z0-9]+$/i, "") + ".md";
  return writeUnique(RAW_SOURCES_DIR, name, markdown);
}

export async function saveWikiMarkdown(slug: string, markdown: string): Promise<string> {
  await ensureDir(WIKI_DIR);
  const full = path.join(WIKI_DIR, `${safeFilename(slug)}.md`);
  await fs.writeFile(full, markdown);
  return full;
}
