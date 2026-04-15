import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "wiki-storage-"));
  vi.spyOn(process, "cwd").mockReturnValue(tmpRoot);
  vi.resetModules();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe("storage helpers", () => {
  it("saveOriginalSource writes decoded bytes under sources/", async () => {
    const { saveOriginalSource } = await import("./storage");
    const base64 = Buffer.from("hello world").toString("base64");
    const full = await saveOriginalSource("doc.txt", base64);
    expect(full).toBe(path.join(tmpRoot, "sources", "doc.txt"));
    const written = await fs.readFile(full, "utf8");
    expect(written).toBe("hello world");
  });

  it("saveRawSourceMarkdown strips source extension and writes .md", async () => {
    const { saveRawSourceMarkdown } = await import("./storage");
    const full = await saveRawSourceMarkdown("guide.PDF", "# Title\n");
    expect(full).toBe(path.join(tmpRoot, "raw_sources", "guide.md"));
    const written = await fs.readFile(full, "utf8");
    expect(written).toBe("# Title\n");
  });

  it("saveWikiMarkdown overwrites by slug under wiki/", async () => {
    const { saveWikiMarkdown } = await import("./storage");
    const first = await saveWikiMarkdown("my-page", "v1");
    const second = await saveWikiMarkdown("my-page", "v2");
    expect(first).toBe(second);
    expect(await fs.readFile(second, "utf8")).toBe("v2");
  });

  it("writes unique filenames when the same source name is uploaded twice", async () => {
    const { saveOriginalSource } = await import("./storage");
    const b64 = Buffer.from("x").toString("base64");
    const a = await saveOriginalSource("dup.txt", b64);
    const b = await saveOriginalSource("dup.txt", b64);
    expect(a).not.toBe(b);
    expect(path.basename(b)).toBe("dup-1.txt");
  });

  it("sanitizes unsafe filename characters", async () => {
    const { saveRawSourceMarkdown } = await import("./storage");
    const full = await saveRawSourceMarkdown("../../etc/passwd.txt", "x");
    expect(path.dirname(full)).toBe(path.join(tmpRoot, "raw_sources"));
    expect(path.basename(full)).not.toContain("/");
  });
});
