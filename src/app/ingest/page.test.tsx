import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import IngestPage from "./page";

vi.mock("mammoth/mammoth.browser", () => ({
  default: {
    convertToMarkdown: async () => ({ value: "# 제목\n\n본문 단락" }),
  },
  convertToMarkdown: async () => ({ value: "# 제목\n\n본문 단락" }),
}));

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

let fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
let queuedNonSettings: Array<{ ok?: boolean; body: unknown }> = [];

beforeEach(() => {
  fetchCalls = [];
  queuedNonSettings = [];
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init });
    if (typeof url === "string" && url.startsWith("/api/settings")) {
      return { ok: true, json: async () => ({ categories: ["계약", "인사", "회계"] }) };
    }
    const next = queuedNonSettings.shift();
    if (!next) return { ok: true, json: async () => ({}) };
    return { ok: next.ok ?? true, json: async () => next.body };
  }) as unknown as typeof fetch;
});

function queueResponses(responses: Array<{ ok?: boolean; body: unknown }>) {
  queuedNonSettings.push(...responses);
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

  it("converts .docx uploads to markdown via mammoth", async () => {
    render(<IngestPage />);
    const input = document.getElementById("file-input") as HTMLInputElement;
    const docxFile = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], "memo.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    Object.defineProperty(input, "files", { value: [docxFile] });
    fireEvent.change(input);

    const textarea = screen.getByPlaceholderText(/문서 내용을 입력하세요/) as HTMLTextAreaElement;
    await waitFor(() => {
      expect(textarea.value).toContain("# 제목");
      expect(textarea.value).toContain("본문 단락");
    });
    expect((screen.getByPlaceholderText("문서 제목") as HTMLInputElement).value).toBe("memo.docx");
  });

  it("rejects legacy .doc uploads with a clear message", async () => {
    render(<IngestPage />);
    const input = document.getElementById("file-input") as HTMLInputElement;
    const docFile = new File([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])], "old.doc", {
      type: "application/msword",
    });
    Object.defineProperty(input, "files", { value: [docFile] });
    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByText(/구형 \.doc 형식/)).toBeInTheDocument();
    });
    const textarea = screen.getByPlaceholderText(/문서 내용을 입력하세요/) as HTMLTextAreaElement;
    expect(textarea.value).toBe("");
  });

  it("converts .txt uploads to markdown: setext headings, bullets, numbered sections", async () => {
    render(<IngestPage />);
    const input = document.getElementById("file-input") as HTMLInputElement;
    const body = [
      "문서 제목",
      "========",
      "",
      "소개 섹션",
      "---------",
      "",
      "1. 첫 번째 조항",
      "1.1 세부 항목",
      "",
      "- 항목 A",
      "• 항목 B",
      "",
      "일반 문장입니다.",
    ].join("\n");
    const txtFile = new File([body], "note.txt", { type: "text/plain" });
    Object.defineProperty(input, "files", { value: [txtFile] });
    fireEvent.change(input);

    const textarea = screen.getByPlaceholderText(/문서 내용을 입력하세요/) as HTMLTextAreaElement;
    await waitFor(() => {
      expect(textarea.value).toContain("# 문서 제목");
      expect(textarea.value).toContain("## 소개 섹션");
      expect(textarea.value).toContain("## 1 첫 번째 조항");
      expect(textarea.value).toContain("### 1.1 세부 항목");
      expect(textarea.value).toContain("- 항목 A");
      expect(textarea.value).toContain("- 항목 B");
      expect(textarea.value).toContain("일반 문장입니다.");
    });
  });

  it("keeps .md uploads as raw text without heuristics", async () => {
    render(<IngestPage />);
    const input = document.getElementById("file-input") as HTMLInputElement;
    const mdFile = new File(["# 이미 마크다운\n\n본문"], "note.md", { type: "text/markdown" });
    Object.defineProperty(input, "files", { value: [mdFile] });
    fireEvent.change(input);

    const textarea = screen.getByPlaceholderText(/문서 내용을 입력하세요/) as HTMLTextAreaElement;
    await waitFor(() => {
      expect(textarea.value).toBe("# 이미 마크다운\n\n본문");
    });
  });

  it("loads categories from /api/settings and renders them as options", async () => {
    render(<IngestPage />);
    const select = (await screen.findByLabelText("카테고리")) as HTMLSelectElement;
    await waitFor(() => {
      expect(select.querySelectorAll("option")).toHaveLength(4); // placeholder + 3
    });
    expect(screen.getByRole("option", { name: "카테고리 없음" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "계약" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "인사" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "회계" })).toBeInTheDocument();
  });

  it("sends the selected category to /api/ingest", async () => {
    queueResponses([
      { body: { id: "src-cat" } },
      { body: { results: [{ action: "created", page: { title: "t", slug: "t" } }] } },
    ]);
    render(<IngestPage />);
    const select = (await screen.findByLabelText("카테고리")) as HTMLSelectElement;
    await waitFor(() => expect(select.querySelectorAll("option").length).toBeGreaterThan(1));

    fireEvent.change(screen.getByPlaceholderText("문서 제목"), { target: { value: "t" } });
    fireEvent.change(screen.getByPlaceholderText(/문서 내용을 입력하세요/), { target: { value: "c" } });
    fireEvent.change(select, { target: { value: "인사" } });
    fireEvent.click(screen.getByRole("button", { name: /Ingest 실행/ }));

    await screen.findByRole("link", { name: "t" });
    const ingestCall = fetchCalls.find((c) => c.url === "/api/ingest");
    expect(ingestCall).toBeDefined();
    const payload = JSON.parse((ingestCall!.init?.body as string) ?? "{}");
    expect(payload).toEqual({ source_id: "src-cat", category: "인사" });
  });

  it("sends category as null when nothing is selected", async () => {
    queueResponses([
      { body: { id: "src-nocat" } },
      { body: { results: [{ action: "created", page: { title: "t", slug: "t" } }] } },
    ]);
    render(<IngestPage />);
    fireEvent.change(screen.getByPlaceholderText("문서 제목"), { target: { value: "t" } });
    fireEvent.change(screen.getByPlaceholderText(/문서 내용을 입력하세요/), { target: { value: "c" } });
    fireEvent.click(screen.getByRole("button", { name: /Ingest 실행/ }));

    await screen.findByRole("link", { name: "t" });
    const ingestCall = fetchCalls.find((c) => c.url === "/api/ingest");
    const payload = JSON.parse((ingestCall!.init?.body as string) ?? "{}");
    expect(payload.category).toBeNull();
  });

  it("resets the category selection after a successful ingest", async () => {
    queueResponses([
      { body: { id: "src-reset" } },
      { body: { results: [{ action: "created", page: { title: "t", slug: "t" } }] } },
    ]);
    render(<IngestPage />);
    const select = (await screen.findByLabelText("카테고리")) as HTMLSelectElement;
    await waitFor(() => expect(select.querySelectorAll("option").length).toBeGreaterThan(1));

    fireEvent.change(screen.getByPlaceholderText("문서 제목"), { target: { value: "t" } });
    fireEvent.change(screen.getByPlaceholderText(/문서 내용을 입력하세요/), { target: { value: "c" } });
    fireEvent.change(select, { target: { value: "계약" } });
    fireEvent.click(screen.getByRole("button", { name: /Ingest 실행/ }));

    await screen.findByRole("link", { name: "t" });
    await waitFor(() => expect(select.value).toBe(""));
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
