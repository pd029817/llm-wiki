import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

type Row = Record<string, any>;

function makeSupabase(pages: Row[]) {
  return {
    from(_table: string) {
      return {
        select: async () => ({ data: pages, error: null }),
      };
    },
  };
}

const supabaseRef: { current: ReturnType<typeof makeSupabase> | null } = { current: null };

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => supabaseRef.current,
}));

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "wiki-lint-"));
  vi.spyOn(process, "cwd").mockReturnValue(tmpRoot);
  vi.resetModules();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(tmpRoot, { recursive: true, force: true });
  supabaseRef.current = null;
});

describe("POST /api/lint", () => {
  it("returns empty list when there are no wiki pages", async () => {
    supabaseRef.current = makeSupabase([]);
    const { POST } = await import("./route");
    const res = await POST();
    const json = await res.json();
    expect(json.issues).toEqual([]);
    expect(json.message).toBe("위키 페이지가 없습니다.");
  });

  it("returns guidance error when lint-report.json is missing", async () => {
    supabaseRef.current = makeSupabase([{ slug: "a" }]);
    const { POST } = await import("./route");
    const res = await POST();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.issues).toEqual([]);
    expect(json.total_pages).toBe(1);
    expect(json.error).toMatch(/wiki-content-lint/);
  });

  it("reads and returns issues from lint-report.json", async () => {
    supabaseRef.current = makeSupabase([{ slug: "a" }, { slug: "b" }]);
    const report = {
      generated_at: "2026-04-15T09:00:00Z",
      total_pages: 2,
      issues: [
        {
          page_slug: "a",
          issue_type: "stale",
          description: "old",
          suggestion: "refresh",
        },
      ],
    };
    await fs.writeFile(path.join(tmpRoot, "lint-report.json"), JSON.stringify(report));

    const { POST } = await import("./route");
    const res = await POST();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.issues).toHaveLength(1);
    expect(json.issues[0].issue_type).toBe("stale");
    expect(json.generated_at).toBe("2026-04-15T09:00:00Z");
    expect(json.total_pages).toBe(2);
  });

  it("does not call any LLM provider", async () => {
    const groqSpy = vi.fn();
    vi.doMock("groq-sdk", () => ({
      default: class {
        chat = { completions: { create: groqSpy } };
      },
    }));
    supabaseRef.current = makeSupabase([{ slug: "a" }]);
    const { POST } = await import("./route");
    await POST();
    expect(groqSpy).not.toHaveBeenCalled();
  });
});
