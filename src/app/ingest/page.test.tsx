import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import IngestPage from "./page";

vi.mock("mammoth/mammoth.browser", () => ({
  default: {
    convertToMarkdown: async () => ({ value: "# 제목\n\n본문 단락" }),
  },
  convertToMarkdown: async () => ({ value: "# 제목\n\n본문 단락" }),
}));

let ocrCalls = 0;
let ocrText = "이미지에서 추출한 글자";
vi.mock("tesseract.js", () => ({
  recognize: async () => {
    ocrCalls++;
    return { data: { text: ocrText } };
  },
}));

type PageSpec = {
  items: { str: string }[];
  imageOps?: boolean;
};
let pdfPages: PageSpec[] = [];
vi.mock("pdfjs-dist", () => ({
  version: "test",
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: ({ data }: { data: ArrayBuffer }) => ({
    promise: Promise.resolve({
      numPages: pdfPages.length,
      getPage: async (n: number) => {
        const spec = pdfPages[n - 1];
        return {
          getTextContent: async () => ({ items: spec.items }),
          getOperatorList: async () => ({ fnArray: spec.imageOps ? [85] : [1, 2] }),
          getViewport: () => ({ width: 10, height: 10 }),
          render: () => ({ promise: Promise.resolve() }),
        };
      },
      _size: data.byteLength,
    }),
  }),
}));

let fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
let queuedNonSettings: Array<{ ok?: boolean; body: unknown }> = [];

beforeEach(() => {
  fetchCalls = [];
  queuedNonSettings = [];
  ocrCalls = 0;
  ocrText = "이미지에서 추출한 글자";
  pdfPages = [
    { items: [{ str: "안녕" }, { str: "하세요" }], imageOps: false },
    { items: [{ str: "PDF" }, { str: "본문" }], imageOps: true },
  ];
  HTMLCanvasElement.prototype.getContext = (() => ({})) as any;
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
      expect(textarea.value).toContain("이미지에서 추출한 텍스트 (OCR)");
      expect(textarea.value).toContain("이미지에서 추출한 글자");
    });
    expect(ocrCalls).toBeGreaterThan(0);
    expect((screen.getByPlaceholderText("문서 제목") as HTMLInputElement).value).toBe("doc.pdf");
  });

  it("skips OCR entirely when no page contains images and text layer is dense", async () => {
    pdfPages = [
      {
        items: Array.from({ length: 50 }, (_, i) => ({ str: `텍스트${i}` })),
        imageOps: false,
      },
    ];
    render(<IngestPage />);
    const input = document.getElementById("file-input") as HTMLInputElement;
    const pdfFile = new File([new Uint8Array([0x25, 0x50])], "dense.pdf", { type: "application/pdf" });
    Object.defineProperty(input, "files", { value: [pdfFile] });
    fireEvent.change(input);

    const textarea = screen.getByPlaceholderText(/문서 내용을 입력하세요/) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toContain("텍스트0"));
    expect(ocrCalls).toBe(0);
    expect(textarea.value).not.toContain("이미지에서 추출한 텍스트 (OCR)");
  });

  it("falls back to OCR output when the text layer is sparse (scanned PDF)", async () => {
    ocrText = "스캔된 본문 한 줄";
    pdfPages = [{ items: [], imageOps: false }];
    render(<IngestPage />);
    const input = document.getElementById("file-input") as HTMLInputElement;
    const pdfFile = new File([new Uint8Array([0x25])], "scan.pdf", { type: "application/pdf" });
    Object.defineProperty(input, "files", { value: [pdfFile] });
    fireEvent.change(input);

    const textarea = screen.getByPlaceholderText(/문서 내용을 입력하세요/) as HTMLTextAreaElement;
    await waitFor(() => {
      expect(textarea.value).toContain("스캔된 본문 한 줄");
    });
    expect(ocrCalls).toBe(1);
  });

  it("dedupes OCR lines that already exist in the text layer", async () => {
    ocrText = "PDF 본문\n완전히 새로운 문장";
    pdfPages = [{ items: [{ str: "PDF" }, { str: "본문" }], imageOps: true }];
    render(<IngestPage />);
    const input = document.getElementById("file-input") as HTMLInputElement;
    const pdfFile = new File([new Uint8Array([0x25])], "mix.pdf", { type: "application/pdf" });
    Object.defineProperty(input, "files", { value: [pdfFile] });
    fireEvent.change(input);

    const textarea = screen.getByPlaceholderText(/문서 내용을 입력하세요/) as HTMLTextAreaElement;
    await waitFor(() => {
      expect(textarea.value).toContain("완전히 새로운 문장");
    });
    const ocrBlock = textarea.value.split("이미지에서 추출한 텍스트 (OCR)")[1] ?? "";
    expect(ocrBlock).not.toContain("- PDF 본문");
    expect(ocrBlock).toContain("- 완전히 새로운 문장");
  });

  it("does not break ingestion when the OCR engine throws", async () => {
    const tesseract = await import("tesseract.js");
    const spy = vi.spyOn(tesseract, "recognize").mockRejectedValueOnce(new Error("ocr down"));
    pdfPages = [{ items: [{ str: "원문" }, { str: "텍스트" }], imageOps: true }];

    render(<IngestPage />);
    const input = document.getElementById("file-input") as HTMLInputElement;
    const pdfFile = new File([new Uint8Array([0x25])], "fail.pdf", { type: "application/pdf" });
    Object.defineProperty(input, "files", { value: [pdfFile] });
    fireEvent.change(input);

    const textarea = screen.getByPlaceholderText(/문서 내용을 입력하세요/) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toContain("원문 텍스트"));
    expect(textarea.value).not.toContain("이미지에서 추출한 텍스트 (OCR)");
    spy.mockRestore();
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
