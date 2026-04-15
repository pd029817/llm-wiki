import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import IngestPage from "./page";

vi.mock("pdfjs-dist", () => ({
  version: "test",
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: ({ data }: { data: ArrayBuffer }) => ({
    promise: Promise.resolve({
      numPages: 2,
      getPage: async (n: number) => ({
        getTextContent: async () => ({
          items:
            n === 1
              ? [{ str: "안녕" }, { str: "하세요" }]
              : [{ str: "PDF" }, { str: "본문" }],
        }),
      }),
      _size: data.byteLength,
    }),
  }),
}));

type FetchMock = ReturnType<typeof vi.fn>;

beforeEach(() => {
  global.fetch = vi.fn() as unknown as typeof fetch;
});

function queueResponses(responses: Array<{ ok?: boolean; body: unknown }>) {
  const fn = global.fetch as unknown as FetchMock;
  responses.forEach((r) => {
    fn.mockResolvedValueOnce({
      ok: r.ok ?? true,
      json: async () => r.body,
    });
  });
}

describe("IngestPage", () => {
  it("renders heading and disables the button when inputs are empty", () => {
    render(<IngestPage />);
    expect(screen.getByRole("heading", { level: 1, name: "소스 업로드" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ingest 실행/ })).toBeDisabled();
  });

  it("enables the button once title and content are provided", () => {
    render(<IngestPage />);
    fireEvent.change(screen.getByPlaceholderText("문서 제목"), { target: { value: "t" } });
    fireEvent.change(screen.getByPlaceholderText(/문서 내용을 입력하세요/), { target: { value: "c" } });
    expect(screen.getByRole("button", { name: /Ingest 실행/ })).toBeEnabled();
  });

  it("renders ingest results as links to the wiki slug after a successful run", async () => {
    queueResponses([
      { body: { id: "src-1" } },
      { body: { results: [{ action: "created", page: { title: "새 페이지", slug: "new-page" } }] } },
    ]);
    render(<IngestPage />);
    fireEvent.change(screen.getByPlaceholderText("문서 제목"), { target: { value: "제목" } });
    fireEvent.change(screen.getByPlaceholderText(/문서 내용을 입력하세요/), { target: { value: "본문" } });
    fireEvent.click(screen.getByRole("button", { name: /Ingest 실행/ }));

    const link = await screen.findByRole("link", { name: "새 페이지" });
    expect(link).toHaveAttribute("href", "/wiki/new-page");
    expect(screen.getByText("생성")).toBeInTheDocument();
  });

  it("shows an error message when source save fails", async () => {
    queueResponses([{ ok: false, body: { error: "소스 저장 실패 상세" } }]);
    render(<IngestPage />);
    fireEvent.change(screen.getByPlaceholderText("문서 제목"), { target: { value: "t" } });
    fireEvent.change(screen.getByPlaceholderText(/문서 내용을 입력하세요/), { target: { value: "c" } });
    fireEvent.click(screen.getByRole("button", { name: /Ingest 실행/ }));

    await waitFor(() => {
      expect(screen.getByText("소스 저장 실패 상세")).toBeInTheDocument();
    });
  });

  it("extracts text from a PDF upload instead of reading raw bytes", async () => {
    render(<IngestPage />);
    const input = document.getElementById("file-input") as HTMLInputElement;
    const pdfFile = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "doc.pdf", {
      type: "application/pdf",
    });
    Object.defineProperty(input, "files", { value: [pdfFile] });
    fireEvent.change(input);

    const textarea = screen.getByPlaceholderText(/문서 내용을 입력하세요/) as HTMLTextAreaElement;
    await waitFor(() => {
      expect(textarea.value).toContain("안녕 하세요");
      expect(textarea.value).toContain("PDF 본문");
    });
    expect((screen.getByPlaceholderText("문서 제목") as HTMLInputElement).value).toBe("doc.pdf");
  });

  it("reads non-PDF files as plain text", async () => {
    render(<IngestPage />);
    const input = document.getElementById("file-input") as HTMLInputElement;
    const txtFile = new File(["plain text body"], "note.txt", { type: "text/plain" });
    Object.defineProperty(input, "files", { value: [txtFile] });
    fireEvent.change(input);

    const textarea = screen.getByPlaceholderText(/문서 내용을 입력하세요/) as HTMLTextAreaElement;
    await waitFor(() => {
      expect(textarea.value).toBe("plain text body");
    });
  });

  it("shows an error message when ingest step fails", async () => {
    queueResponses([
      { body: { id: "src-2" } },
      { ok: false, body: { error: "Ingest 실패 사유" } },
    ]);
    render(<IngestPage />);
    fireEvent.change(screen.getByPlaceholderText("문서 제목"), { target: { value: "t" } });
    fireEvent.change(screen.getByPlaceholderText(/문서 내용을 입력하세요/), { target: { value: "c" } });
    fireEvent.click(screen.getByRole("button", { name: /Ingest 실행/ }));

    await waitFor(() => {
      expect(screen.getByText("Ingest 실패 사유")).toBeInTheDocument();
    });
  });
});
