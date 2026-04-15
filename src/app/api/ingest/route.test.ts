import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

type Row = Record<string, any>;

function makeSupabase(initial: { sources?: Row[]; pages?: Row[] }) {
  const state = {
    raw_sources: [...(initial.sources ?? [])] as Row[],
    wiki_pages: [...(initial.pages ?? [])] as Row[],
    change_log: [] as Row[],
  };

  function from(table: keyof typeof state) {
    const builder: any = {
      _table: table,
      _filters: [] as Array<[string, any]>,
      _inserted: null as Row | null,
      _updated: null as Row | null,
      _mode: "select" as "select" | "insert" | "update",
      select() {
        return builder;
      },
      eq(col: string, val: any) {
        builder._filters.push([col, val]);
        return builder;
      },
      insert(row: Row) {
        builder._mode = "insert";
        builder._inserted = row;
        return builder;
      },
      update(row: Row) {
        builder._mode = "update";
        builder._updated = row;
        return builder;
      },
      _rows() {
        return state[table].filter((r) =>
          builder._filters.every(([c, v]: [string, any]) => r[c] === v)
        );
      },
      _run() {
        if (builder._mode === "insert") {
          const newRow = {
            id: `id-${state[table].length + 1}`,
            version: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...builder._inserted,
          };
          state[table].push(newRow);
          return newRow;
        }
        if (builder._mode === "update") {
          const matches = builder._rows();
          matches.forEach((r: Row) => Object.assign(r, builder._updated));
          return matches[0];
        }
        return builder._rows()[0];
      },
      single() {
        const row = builder._run();
        if (!row) return Promise.resolve({ data: null, error: { message: "not found" } });
        return Promise.resolve({ data: row, error: null });
      },
      maybeSingle() {
        const row = builder._run();
        return Promise.resolve({ data: row ?? null, error: null });
      },
      then(resolve: any) {
        const row = builder._run();
        return Promise.resolve({ data: row ?? null, error: null }).then(resolve);
      },
    };
    return builder;
  }

  return { from, _state: state };
}

const supabaseRef: { current: ReturnType<typeof makeSupabase> | null } = { current: null };

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => supabaseRef.current,
}));

function postRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  supabaseRef.current = null;
});

describe("POST /api/ingest", () => {
  it("returns 404 when source does not exist", async () => {
    supabaseRef.current = makeSupabase({ sources: [] });
    const { POST } = await import("./route");
    const res = await POST(postRequest({ source_id: "missing" }));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Source not found");
  });

  it("creates a wiki page with markdown content when the slug is new", async () => {
    supabaseRef.current = makeSupabase({
      sources: [
        {
          id: "src-1",
          title: "NDA_미래테크.pdf",
          content: "첫 문단입니다.\n\n제1조 (목적) 본 계약은 ...\n\n둘째 문단.",
        },
      ],
      pages: [],
    });
    const { POST } = await import("./route");
    const res = await POST(postRequest({ source_id: "src-1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results).toHaveLength(1);
    expect(json.results[0].action).toBe("created");

    const pages = supabaseRef.current!._state.wiki_pages;
    expect(pages).toHaveLength(1);
    expect(pages[0].title).toBe("NDA_미래테크");
    expect(pages[0].slug).toBe("nda-미래테크");
    expect(pages[0].content).toContain("# NDA_미래테크");
    expect(pages[0].content).toContain("## 제1조");
    expect(pages[0].source_ids).toEqual(["src-1"]);

    const logs = supabaseRef.current!._state.change_log;
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe("created");
  });

  it("updates existing wiki page when slug already exists and merges source ids", async () => {
    supabaseRef.current = makeSupabase({
      sources: [{ id: "src-2", title: "문서", content: "업데이트된 본문" }],
      pages: [
        {
          id: "page-1",
          slug: "문서",
          title: "문서",
          content: "이전 본문",
          version: 3,
          source_ids: ["src-old"],
        },
      ],
    });
    const { POST } = await import("./route");
    const res = await POST(postRequest({ source_id: "src-2" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results[0].action).toBe("updated");

    const page = supabaseRef.current!._state.wiki_pages[0];
    expect(page.version).toBe(4);
    expect(page.content).toContain("업데이트된 본문");
    expect(page.source_ids).toEqual(["src-old", "src-2"]);

    const logs = supabaseRef.current!._state.change_log;
    expect(logs[0].action).toBe("updated");
    expect(logs[0].page_id).toBe("page-1");
  });

  it("does not call any external LLM provider", async () => {
    const groqSpy = vi.fn();
    vi.doMock("groq-sdk", () => ({ default: class { chat = { completions: { create: groqSpy } }; } }));
    supabaseRef.current = makeSupabase({
      sources: [{ id: "src-3", title: "t", content: "c" }],
    });
    const { POST } = await import("./route");
    const res = await POST(postRequest({ source_id: "src-3" }));
    expect(res.status).toBe(200);
    expect(groqSpy).not.toHaveBeenCalled();
  });
});
