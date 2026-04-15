import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ChatPage from "./page";

vi.mock("@/components/chat-message", () => ({
  ChatMessage: ({ role, content }: { role: string; content: string }) => (
    <div data-testid={`msg-${role}`}>{content}</div>
  ),
}));

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  global.fetch = vi.fn() as unknown as typeof fetch;
});

describe("ChatPage", () => {
  it("renders heading and empty-state hint", () => {
    render(<ChatPage />);
    expect(screen.getByRole("heading", { level: 1, name: "챗봇" })).toBeInTheDocument();
    expect(screen.getByText(/위키 지식 기반으로 대화하세요/)).toBeInTheDocument();
  });

  it("send button is disabled until input is non-empty", () => {
    render(<ChatPage />);
    expect(screen.getByRole("button", { name: "전송" })).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/메시지를 입력하세요/), { target: { value: "안녕" } });
    expect(screen.getByRole("button", { name: "전송" })).toBeEnabled();
  });

  it("sends a user message and renders an assistant reply", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      json: async () => ({ answer: "네 안녕하세요", session_id: "sess-1", sources: [] }),
    });
    render(<ChatPage />);
    fireEvent.change(screen.getByPlaceholderText(/메시지를 입력하세요/), { target: { value: "안녕" } });
    fireEvent.click(screen.getByRole("button", { name: "전송" }));

    expect(screen.getByTestId("msg-user")).toHaveTextContent("안녕");
    await waitFor(() => {
      expect(screen.getByTestId("msg-assistant")).toHaveTextContent("네 안녕하세요");
    });
  });

  it("submits on Enter", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ answer: "ok", session_id: "s" }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    render(<ChatPage />);
    const input = screen.getByPlaceholderText(/메시지를 입력하세요/);
    fireEvent.change(input, { target: { value: "hi" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chat",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
