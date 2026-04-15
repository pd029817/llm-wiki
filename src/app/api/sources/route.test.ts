import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { NextRequest } from "next/server";

type Row = Record<string, any>;

function makeSupabase() {
  const state: { raw_sources: Row[] } = { raw_sources: [] };
  return {
    from(_t: string) {
      const b: any = {
        _inserted: null as Row | null,
        insert(row: Row) {
          b._inserted = row;
          return b;
        },
        select() {
          return b;
        },
        single() {
          const row = {
            id: `id-${state.raw_sources.length + 1}`,
            created_at: new Date().toISOString(),
            ...b._inserted,
          };
          state.raw_sources.push(row);
          return Promise.resolve({ data: row, error: null });
        },
      };
      return b;
    },
    _state: state,
  };
}

const supabaseRef: { current: ReturnType<typeof makeSupabase> | null } = { current: null };

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => supabaseRef.current,
}));

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "wiki-sources-"));
  vi.spyOn(process, "cwd").mockReturnValue(tmpRoot);
  vi.resetModules();
  supabaseRef.current = makeSupabase();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(tmpRoot, { recursive: true, force: true });
  supabaseRef.current = null;
});

function postRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/sources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/sources", () => {
  it("saves DB row and writes both original file and markdown to disk", async () => {
    const { POST } = await import("./route");
    const base64 = Buffer.from("원본 바이트").toString("base64");
    const res = await POST(
      postRequest({
        title: "계약서",
        content: "# 계약서\n\n본문",
        original_filename: "계약서.pdf",
        original_base64: base64,
      })
    );
    expect(res.status).toBe(200);

    const saved = supabaseRef.current!._state.raw_sources[0];
    expect(saved.title).toBe("계약서");
    expect(saved.content).toContain("본문");

    const original = await fs.readFile(path.join(tmpRoot, "sources", "계약서.pdf"), "utf8");
    expect(original).toBe("원본 바이트");

    const md = await fs.readFile(path.join(tmpRoot, "raw_sources", "계약서.md"), "utf8");
    expect(md).toContain("본문");
  });

  it("still succeeds when original_base64 is omitted (only markdown saved)", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      postRequest({ title: "메모", content: "메모 본문" })
    );
    expect(res.status).toBe(200);

    await expect(
      fs.readFile(path.join(tmpRoot, "raw_sources", "메모.md"), "utf8")
    ).resolves.toBe("메모 본문");

    await expect(fs.readdir(path.join(tmpRoot, "sources"))).rejects.toThrow();
  });
});
