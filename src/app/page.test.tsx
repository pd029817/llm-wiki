import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Dashboard from "./page";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

type MockRow = {
  id: number;
  summary: string;
  created_at: string;
  wiki_pages: { title: string; slug: string } | null;
};

const state: {
  pageCount: number | null;
  sourceCount: number | null;
  recentChanges: MockRow[];
} = {
  pageCount: 23,
  sourceCount: 43,
  recentChanges: [],
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => ({
      select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.head) {
          const count = table === "wiki_pages" ? state.pageCount : state.sourceCount;
          return Promise.resolve({ count, data: null });
        }
        return {
          order: () => ({
            limit: () => Promise.resolve({ data: state.recentChanges }),
          }),
        };
      },
    }),
  }),
}));

beforeEach(() => {
  state.pageCount = 23;
  state.sourceCount = 43;
  state.recentChanges = [];
});

describe("Dashboard", () => {
  it("renders wiki page card as a link to /wiki with the count", async () => {
    render(await Dashboard());
    const link = screen.getByRole("link", { name: /위키 페이지/ });
    expect(link).toHaveAttribute("href", "/wiki");
    expect(link.textContent).toMatch(/23/);
  });

  it("renders source card as a link to /ingest with the count", async () => {
    render(await Dashboard());
    const link = screen.getByRole("link", { name: /원본 소스/ });
    expect(link).toHaveAttribute("href", "/ingest");
    expect(link.textContent).toMatch(/43/);
  });

  it("shows empty state when there are no change_log entries", async () => {
    render(await Dashboard());
    expect(screen.getByText(/변경 이력이 없습니다/)).toBeInTheDocument();
  });

  it("renders 0 when counts are null", async () => {
    state.pageCount = null;
    state.sourceCount = null;
    render(await Dashboard());
    const wikiLink = screen.getByRole("link", { name: /위키 페이지/ });
    const sourceLink = screen.getByRole("link", { name: /원본 소스/ });
    expect(wikiLink.textContent).toMatch(/0/);
    expect(sourceLink.textContent).toMatch(/0/);
  });

  it("renders recent change log rows linking to wiki slugs", async () => {
    state.recentChanges = [
      {
        id: 1,
        summary: "초안 작성",
        created_at: "2026-04-10T00:00:00Z",
        wiki_pages: { title: "첫 페이지", slug: "first-page" },
      },
      {
        id: 2,
        summary: "오타 수정",
        created_at: "2026-04-11T00:00:00Z",
        wiki_pages: { title: "두번째", slug: "second" },
      },
    ];
    render(await Dashboard());
    expect(screen.queryByText(/변경 이력이 없습니다/)).not.toBeInTheDocument();

    const first = screen.getByRole("link", { name: "첫 페이지" });
    expect(first).toHaveAttribute("href", "/wiki/first-page");
    const second = screen.getByRole("link", { name: "두번째" });
    expect(second).toHaveAttribute("href", "/wiki/second");

    expect(screen.getByText("초안 작성")).toBeInTheDocument();
    expect(screen.getByText("오타 수정")).toBeInTheDocument();
  });

  it("renders quick actions card with upload and lint links", async () => {
    render(await Dashboard());
    const upload = screen.getByRole("link", { name: "업로드" });
    expect(upload).toHaveAttribute("href", "/ingest");
    const lint = screen.getByRole("link", { name: "Lint" });
    expect(lint).toHaveAttribute("href", "/lint");
  });

  it("renders dashboard heading and recent changes section", async () => {
    render(await Dashboard());
    expect(screen.getByRole("heading", { level: 1, name: "대시보드" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "최근 변경" })).toBeInTheDocument();
  });

  it("formats change date in Korean locale", async () => {
    state.recentChanges = [
      {
        id: 1,
        summary: "초안",
        created_at: "2026-04-10T00:00:00Z",
        wiki_pages: { title: "페이지", slug: "page" },
      },
    ];
    const { container } = render(await Dashboard());
    const item = container.querySelector("li");
    expect(item).not.toBeNull();
    expect(within(item as HTMLElement).getByText(/2026/)).toBeInTheDocument();
  });
});
