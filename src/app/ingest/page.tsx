"use client";

import { useState } from "react";
import { FileUpload } from "@/components/file-upload";

export default function IngestPage() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState("");

  const handleFileSelect = async (file: File) => {
    const text = await file.text();
    setTitle(file.name);
    setContent(text);
  };

  const handleIngest = async () => {
    if (!title || !content) return;
    setLoading(true);
    setError("");
    setResults([]);

    const sourceRes = await fetch("/api/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content, mime_type: "text/plain" }),
    });
    const source = await sourceRes.json();

    if (!sourceRes.ok) {
      setError(source.error || "소스 저장 실패");
      setLoading(false);
      return;
    }

    const ingestRes = await fetch("/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_id: source.id }),
    });
    const ingestData = await ingestRes.json();

    if (!ingestRes.ok) {
      setError(ingestData.error || "Ingest 실패");
    } else {
      setResults(ingestData.results || []);
      setTitle("");
      setContent("");
    }
    setLoading(false);
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
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="문서 제목"
          />
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium mb-1">내용 (직접 입력 또는 파일에서 로드)</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm h-48 font-mono"
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
