"use client";

import { useEffect, useMemo, useState } from "react";
import { RawSource } from "@/lib/types";

export default function SourcesPage() {
  const [sources, setSources] = useState<RawSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/sources");
        const data = await res.json();
        if (!res.ok) {
          setError(data?.error || "원본 소스를 불러오지 못했습니다.");
          return;
        }
        setSources(Array.isArray(data) ? data : []);
      } catch (e: any) {
        setError(e?.message || "원본 소스를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sources;
    return sources.filter(
      (s) =>
        s.title?.toLowerCase().includes(q) ||
        (s.content ?? "").toLowerCase().includes(q)
    );
  }, [sources, query]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const fmtBytes = (n: number) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">원본 소스</h1>

      <div className="mb-4 flex items-center gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="제목 또는 내용으로 검색..."
          className="flex-1 border rounded px-3 py-2 text-sm text-gray-900"
        />
        <span className="text-xs text-gray-500">
          {filtered.length} / {sources.length}건
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">로딩 중...</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-500">
          {sources.length === 0
            ? "업로드된 원본 소스가 없습니다."
            : "검색 결과가 없습니다."}
        </p>
      ) : (
        <div className="bg-white rounded-lg shadow-sm divide-y">
          {filtered.map((s) => {
            const isOpen = expanded.has(s.id);
            const size = (s.content ?? "").length;
            return (
              <div key={s.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {s.title || "(제목 없음)"}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3">
                      <span>{fmtDate(s.created_at)}</span>
                      {s.mime_type && <span>{s.mime_type}</span>}
                      <span>{fmtBytes(size)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => toggle(s.id)}
                    className="text-xs text-blue-600 hover:underline shrink-0"
                  >
                    {isOpen ? "접기" : "본문 보기"}
                  </button>
                </div>
                {isOpen && (
                  <pre className="mt-3 max-h-96 overflow-auto bg-gray-50 border rounded p-3 text-xs font-mono whitespace-pre-wrap text-gray-800">
                    {s.content || "(내용 없음)"}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
