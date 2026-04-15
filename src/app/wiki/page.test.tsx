import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import WikiBrowser from "./page";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const mockPages = [
  { id: "1", slug: "allcare-plus-6", title: "T 올케어플러스6", version: 1, category: "기술문서" },
  { id: "2", slug: "battery-swap", title: "배터리 교체", version: 1, category: "기술문서" },
  { id: "3", slug: "misc", title: "미분류항목", version: 2, category: null },
];

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    json: async () => mockPages,
  }) as unknown as typeof fetch;
});

describe("WikiBrowser list", () => {
  it("renders each page title wrapped in an anchor pointing to its slug", async () => {
    render(<WikiBrowser />);
    const link = await screen.findByRole("link", { name: /T 올케어플러스6/ });
    expect(link).toHaveAttribute("href", "/wiki/allcare-plus-6");
  });

  it("renders page titles with blue link styling (regression: link style disappeared)", async () => {
    render(<WikiBrowser />);
    await waitFor(() => expect(screen.getByText("배터리 교체")).toBeInTheDocument());
    const titleSpan = screen.getByText("배터리 교체");
    expect(titleSpan.className).toMatch(/text-blue-600/);
    expect(titleSpan.className).toMatch(/hover:underline/);
  });

  it("applies link styling to uncategorized items too", async () => {
    render(<WikiBrowser />);
    await waitFor(() => expect(screen.getByText("미분류항목")).toBeInTheDocument());
    const titleSpan = screen.getByText("미분류항목");
    expect(titleSpan.className).toMatch(/text-blue-600/);
  });

  it("shows empty state when no pages are returned", async () => {
    global.fetch = vi.fn().mockResolvedValue({ json: async () => [] }) as unknown as typeof fetch;
    render(<WikiBrowser />);
    await waitFor(() => {
      expect(screen.getByText(/위키 페이지가 없습니다/)).toBeInTheDocument();
    });
  });
});
