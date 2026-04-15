import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Dashboard from "./page";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    default: actual,
    promises: {
      ...actual.promises,
      readFile: vi.fn(async () => {
        throw new Error("no report");
      }),
    },
  };
});

type MockRow = {
  id: number;
  summary: string;
  created_at: string;
  wiki_pages: { title: string; slug: string; category?: string } | null;
};

const state: {
  pageCount: number | null;
  sourceCount: number | null;
  chatCount: number | null;
  queryCount: number | null;
  recentChanges: MockRow[];
  topPages: Array<{ title: string; slug: string; version: number; updated_at: string }>;
  categoryRows: Array<{ category: string | null }>;
} = {
  pageCount: 23,
  sourceCount: 43,
  chatCount: 7,
  queryCount: 12,
  recentChanges: [],
  topPages: [],
  categoryRows: [],
};

function makeBuilder(table: string) {
  const builder: any = {
    _table: table,
    _isCountHead: false,
    _filters: {} as Record<string, unknown>,
    select(_cols?: string, opts?: { count?: string; head?: boolean }) {
      this._isCountHead = !!opts?.head;
      return this;
    },
    eq(col: string, val: unknown) {
      this._filters[col] = val;
      return this;
    },
    gte() {
      return this;
    },
    textSearch() {
      return this;
    },
    order() {
      return this;
    },
    limit() {
      return this.resolve();
    },
    single() {
      return Promise.resolve({ data: null });
    },
    then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
      return this.resolve().then(onFulfilled, onRejected);
    },
    resolve() {
      if (this._isCountHead) {
        let count: number | null = 0;
        if (this._table === "wiki_pages") count = state.pageCount;
        else if (this._table === "raw_sources") count = state.sourceCount;
        else if (this._table === "chat_sessions") {
          count = this._filters.session_type === "query" ? state.queryCount : state.chatCount;
        } else if (this._table === "change_log") count = 0;
        return Promise.resolve({ count, data: null });
      }
      if (this._table === "change_log") return Promise.resolve({ data: state.recentChanges });
      if (this._table === "wiki_pages") {
        if (this._filters.__cat) return Promise.resolve({ data: state.categoryRows });
        return Promise.resolve({ data: state.topPages });
      }
      return Promise.resolve({ data: [] });
    },
  };
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      const b = makeBuilder(table);
      const originalSelect = b.select.bind(b);
      b.select = (cols?: string, opts?: { count?: string; head?: boolean }) => {
        originalSelect(cols, opts);
        if (table === "wiki_pages" && cols === "category") {
          b._filters.__cat = true;
          return Promise.resolve({ data: state.categoryRows });
        }
        return b;
      };
      return b;
    },
  }),
}));

beforeEach(() => {
  state.pageCount = 23;
  state.sourceCount = 43;
  state.chatCount = 7;
  state.queryCount = 12;
  state.recentChanges = [];
  state.topPages = [];
  state.categoryRows = [];
});

describe("Dashboard", () => {
  it("renders wiki page card linking to /wiki with the count", async () => {
    render(await Dashboard());
    const link = screen.getByRole("link", { name: /위키 페이지/ });
    expect(link).toHaveAttribute("href", "/wiki");
    expect(link.textContent).toMatch(/23/);
  });

  it("renders source card linking to /sources with the count", async () => {
    render(await Dashboard());
    const link = screen.getByRole("link", { name: /원본 소스/ });
    expect(link).toHaveAttribute("href", "/sources");
    expect(link.textContent).toMatch(/43/);
  });

  it("renders query session card linking to /query with queryCount", async () => {
    render(await Dashboard());
    const link = screen.getByRole("link", { name: /질의 세션/ });
    expect(link).toHaveAttribute("href", "/query");
    expect(link.textContent).toMatch(/12/);
  });

  it("renders chatbot session card linking to /chat with chatCount", async () => {
    render(await Dashboard());
    const link = screen.getByRole("link", { name: /챗봇 세션/ });
    expect(link).toHaveAttribute("href", "/chat");
    expect(link.textContent).toMatch(/7/);
  });

  it("renders Lint issue card linking to /lint", async () => {
    render(await Dashboard());
    const link = screen.getByRole("link", { name: /Lint 이슈/ });
    expect(link).toHaveAttribute("href", "/lint");
  });

  it("renders 0 when counts are null", async () => {
    state.pageCount = null;
    state.sourceCount = null;
    state.chatCount = null;
    state.queryCount = null;
    render(await Dashboard());
    const wikiLink = screen.getByRole("link", { name: /위키 페이지/ });
    expect(wikiLink.textContent).toMatch(/\b0\b/);
  });

  it("shows empty state when there are no change_log entries", async () => {
    render(await Dashboard());
    expect(screen.getByText(/해당 카테고리의 변경 이력이 없습니다|변경 이력이 없습니다/)).toBeInTheDocument();
  });

  it("renders dashboard heading and recent changes tab header", async () => {
    render(await Dashboard());
    expect(screen.getByRole("heading", { level: 1, name: "대시보드" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "최근 변경" })).toBeInTheDocument();
  });

  it("renders recent change rows with wiki slug links", async () => {
    state.recentChanges = [
      {
        id: 1,
        summary: "초안 작성",
        created_at: "2026-04-10T00:00:00Z",
        wiki_pages: { title: "첫 페이지", slug: "first-page", category: "기술문서" },
      },
    ];
    render(await Dashboard());
    const first = screen.getByRole("link", { name: "첫 페이지" });
    expect(first).toHaveAttribute("href", "/wiki/first-page");
    expect(screen.getByText("초안 작성")).toBeInTheDocument();
  });
});
