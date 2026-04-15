"use client";

import { useEffect, useState } from "react";
import { FileUpload } from "@/components/file-upload";

export default function IngestPage() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/settings");
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        if (Array.isArray(data?.categories)) setCategories(data.categories);
      } catch {
        // ignore — 카테고리 로드 실패해도 업로드는 진행
      }
    })();
  }, []);

  const extractPdfText = async (file: File): Promise<string> => {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    const buf = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: buf }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();

      // y좌표(transform[5])로 같은 줄에 속한 아이템을 그룹핑
      const lineMap = new Map<number, { x: number; str: string }[]>();
      for (const it of tc.items as any[]) {
        const str = it.str ?? "";
        if (!str) continue;
        const y = Math.round(it.transform?.[5] ?? 0);
        const x = it.transform?.[4] ?? 0;
        if (!lineMap.has(y)) lineMap.set(y, []);
        lineMap.get(y)!.push({ x, str });
      }

      const ys = [...lineMap.keys()].sort((a, b) => b - a); // 위→아래
      const lines: { y: number; text: string }[] = [];
      for (const y of ys) {
        const items = lineMap.get(y)!.sort((a, b) => a.x - b.x);
        const text = items.map((t) => t.str).join(" ").replace(/\s+/g, " ").trim();
        if (text) lines.push({ y, text });
      }

      // 줄 간격이 크면 빈 줄(단락 구분)을 삽입
      const gaps = lines.slice(1).map((l, i) => lines[i].y - l.y).filter((g) => g > 0);
      const median = gaps.length ? [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : 0;
      const pageLines: string[] = [];
      for (let k = 0; k < lines.length; k++) {
        pageLines.push(lines[k].text);
        if (k < lines.length - 1) {
          const gap = lines[k].y - lines[k + 1].y;
          if (median > 0 && gap > median * 1.6) pageLines.push("");
        }
      }
      pages.push(pageLines.join("\n"));
    }
    return pages.join("\n\n");
  };

  const handleFileSelect = async (file: File) => {
    setError("");
    setTitle(file.name);
    try {
      const isPdf =
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf");
      const text = isPdf ? await extractPdfText(file) : await file.text();
      setContent(text);
    } catch (e: any) {
      setError(`파일 읽기 실패: ${e?.message ?? e}`);
      setContent("");
    }
  };

  const handleIngest = async () => {
    if (!title || !content) return;
    setLoading(true);
    setError("");
    setResults([]);

    try {
      const sourceRes = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, mime_type: "text/plain" }),
      });
      const source = await sourceRes.json().catch(() => ({}));

      if (!sourceRes.ok) {
        setError(source.error || "소스 저장 실패");
        return;
      }

      const ingestRes = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_id: source.id, category: category || null }),
      });
      const ingestData = await ingestRes.json().catch(() => ({}));

      if (!ingestRes.ok) {
        setError(ingestData.error || "Ingest 실패");
      } else {
        setResults(ingestData.results || []);
        setTitle("");
        setContent("");
        setCategory("");
      }
    } catch (e: any) {
      setError(e?.message || "Ingest 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">소스 업로드</h1>

      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <FileUpload onFileSelect={handleFileSelect} />

        <div className="mt-4">
          <label className="block text-sm font-medium mb-1">제목</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm text-gray-900"
            placeholder="문서 제목"
          />
        </div>

        <div className="mt-4">
          <label htmlFor="category" className="block text-sm font-medium mb-1">카테고리</label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm text-gray-900"
          >
            <option value="">카테고리 없음</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium mb-1">내용 (직접 입력 또는 파일에서 로드)</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm text-gray-900 h-48 font-mono"
            placeholder="문서 내용을 입력하세요..."
          />
        </div>

        <button
          onClick={handleIngest}
          disabled={loading || !title || !content}
          className="mt-4 bg-gray-900 text-white px-6 py-2 rounded text-sm hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? "처리 중..." : "Ingest 실행"}
        </button>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      {results.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Ingest 결과</h2>
          <div className="bg-white rounded-lg shadow-sm divide-y">
            {results.map((r, i) => (
              <div key={i} className="px-4 py-3">
                <span className={`text-xs font-medium px-2 py-0.5 rounded mr-2 ${
                  r.action === "created" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                }`}>
                  {r.action === "created" ? "생성" : "업데이트"}
                </span>
                <a href={`/wiki/${r.page.slug}`} className="text-sm text-blue-600 hover:underline">
                  {r.page.title}
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
