import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import LintPage from "./page";

beforeEach(() => {
  global.fetch = vi.fn() as unknown as typeof fetch;
});

function mockLintResponse(body: unknown, ok = true) {
  (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok,
    text: async () => JSON.stringify(body),
    json: async () => body,
  });
}

describe("LintPage", () => {
  it("renders heading and the Lint run button", () => {
    render(<LintPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Lint 리포트" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Lint 실행/ })).toBeEnabled();
  });

  it("shows empty state after running with no issues", async () => {
    mockLintResponse({ issues: [], total_pages: 5 });
    render(<LintPage />);
    fireEvent.click(screen.getByRole("button", { name: /Lint 실행/ }));
    await waitFor(() => {
      expect(screen.getByText(/문제가 발견되지 않았습니다/)).toBeInTheDocument();
    });
    expect(screen.getByText(/5개 페이지 점검 완료 \| 0건 발견/)).toBeInTheDocument();
  });

  it("renders issues with type label and link to page", async () => {
    mockLintResponse({
      total_pages: 3,
      issues: [
        {
          page_slug: "page-a",
          issue_type: "contradiction",
          description: "두 페이지가 모순됨",
          suggestion: "하나로 통합",
        },
      ],
    });
    render(<LintPage />);
    fireEvent.click(screen.getByRole("button", { name: /Lint 실행/ }));

    expect(await screen.findByText("모순")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "page-a" });
    expect(link).toHaveAttribute("href", "/wiki/page-a");
    expect(screen.getByText("두 페이지가 모순됨")).toBeInTheDocument();
    expect(screen.getByText(/제안: 하나로 통합/)).toBeInTheDocument();
  });

  it("marks an issue as dismissed when '원본 유지' is clicked", async () => {
    mockLintResponse({
      total_pages: 1,
      issues: [
        { page_slug: "p1", issue_type: "stale", description: "d", suggestion: "s" },
      ],
    });
    render(<LintPage />);
    fireEvent.click(screen.getByRole("button", { name: /Lint 실행/ }));
    const keepBtn = await screen.findByRole("button", { name: "원본 유지" });
    fireEvent.click(keepBtn);
    expect(screen.getByText(/— 원본 유지/)).toBeInTheDocument();
  });

  it("shows modal with error when API returns error payload", async () => {
    mockLintResponse({ error: "LLM 키 없음", issues: [], total_pages: 0 });
    render(<LintPage />);
    fireEvent.click(screen.getByRole("button", { name: /Lint 실행/ }));
    expect(await screen.findByText("알림")).toBeInTheDocument();
    expect(screen.getByText("LLM 키 없음")).toBeInTheDocument();
  });
});
