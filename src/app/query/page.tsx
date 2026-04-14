"use client";

import { useState } from "react";
import { MarkdownViewer } from "@/components/markdown-viewer";

export default function QueryPage() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<{ title: string; slug: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const handleQuery = async () => {
    if (!question.trim()) return;
    setLoading(true);
    setAnswer("");
    setSources([]);

    const res = await fetch("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const data = await res.json();

    setAnswer(data.answer || "답변을 생성할 수 없습니다.");
    setSources(data.sources || []);
    setLoading(false);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">질의</h1>

      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="위키 지식에 기반하여 질문하세요..."
          className="w-full border rounded px-3 py-2 text-sm text-gray-900 h-24"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleQuery(); } }}
        />
        <button
          onClick={handleQuery}
          disabled={loading || !question.trim()}
          className="mt-3 bg-gray-900 text-white px-6 py-2 rounded text-sm hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? "검색 중..." : "질문하기"}
        </button>
      </div>

      {answer && (
        <div className="bg-white rounded-lg shadow-sm p-6 mb-4">
          <h2 className="text-sm font-semibold text-gray-600 mb-3">답변</h2>
          <MarkdownViewer content={answer} />
        </div>
      )}

      {sources.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-600 mb-2">참고한 위키 페이지</h2>
          <div className="flex flex-wrap gap-2">
            {sources.map((s) => (
              <a
                key={s.slug}
                href={`/wiki/${s.slug}`}
                className="text-sm bg-gray-100 px-3 py-1 rounded hover:bg-gray-200"
              >
                {s.title}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
