import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import QueryPage from "./page";

vi.mock("@/components/markdown-viewer", () => ({
  MarkdownViewer: ({ content }: { content: string }) => <div data-testid="md">{content}</div>,
}));

beforeEach(() => {
  global.fetch = vi.fn() as unknown as typeof fetch;
});

describe("QueryPage", () => {
  it("renders heading and disables the submit button when empty", () => {
    render(<QueryPage />);
    expect(screen.getByRole("heading", { level: 1, name: "질의" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /질문하기/ })).toBeDisabled();
  });

  it("submits a question and renders the answer + sources", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      json: async () => ({
        answer: "이것은 답변입니다",
        sources: [{ title: "참고1", slug: "ref-1" }],
      }),
    });
    render(<QueryPage />);
    fireEvent.change(screen.getByPlaceholderText(/위키 지식에 기반하여/), { target: { value: "질문?" } });
    fireEvent.click(screen.getByRole("button", { name: /질문하기/ }));

    expect(await screen.findByTestId("md")).toHaveTextContent("이것은 답변입니다");
    const ref = screen.getByRole("link", { name: "참고1" });
    expect(ref).toHaveAttribute("href", "/wiki/ref-1");
  });

  it("falls back to default text when answer is missing", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      json: async () => ({}),
    });
    render(<QueryPage />);
    fireEvent.change(screen.getByPlaceholderText(/위키 지식에 기반하여/), { target: { value: "?" } });
    fireEvent.click(screen.getByRole("button", { name: /질문하기/ }));
    expect(await screen.findByTestId("md")).toHaveTextContent("답변을 생성할 수 없습니다.");
  });

  it("submits on Enter (without shift)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ answer: "ok", sources: [] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    render(<QueryPage />);
    const textarea = screen.getByPlaceholderText(/위키 지식에 기반하여/);
    fireEvent.change(textarea, { target: { value: "질문" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    await screen.findByTestId("md");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/query",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
