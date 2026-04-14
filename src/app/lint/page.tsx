"use client";

import { useState } from "react";

interface LintIssue {
  page_slug: string;
  issue_type: string;
  description: string;
  suggestion: string;
}

const issueTypeLabels: Record<string, { label: string; color: string }> = {
  contradiction: { label: "모순", color: "bg-red-100 text-red-700" },
  stale: { label: "오래됨", color: "bg-yellow-100 text-yellow-700" },
  orphan: { label: "고아 페이지", color: "bg-orange-100 text-orange-700" },
  missing_link: { label: "누락 링크", color: "bg-blue-100 text-blue-700" },
};

export default function LintPage() {
  const [issues, setIssues] = useState<LintIssue[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const handleLint = async () => {
    setLoading(true);
    const res = await fetch("/api/lint", { method: "POST" });
    const data = await res.json();
    setIssues(data.issues || []);
    setTotalPages(data.total_pages || 0);
    setHasRun(true);
    setLoading(false);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Lint 리포트</h1>
        <button
          onClick={handleLint}
          disabled={loading}
          className="bg-gray-900 text-white px-4 py-2 rounded text-sm hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? "점검 중..." : "Lint 실행"}
        </button>
      </div>

      {hasRun && (
        <div className="mb-4 text-sm text-gray-500">
          {totalPages}개 페이지 점검 완료 | {issues.length}건 발견
        </div>
      )}

      {issues.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm divide-y">
          {issues.map((issue, i) => {
            const typeInfo = issueTypeLabels[issue.issue_type] || { label: issue.issue_type, color: "bg-gray-100 text-gray-700" };
            return (
              <div key={i} className="px-4 py-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${typeInfo.color}`}>
                    {typeInfo.label}
                  </span>
                  <a href={`/wiki/${issue.page_slug}`} className="text-sm text-blue-600 hover:underline">
                    {issue.page_slug}
                  </a>
                </div>
                <p className="text-sm text-gray-700">{issue.description}</p>
                <p className="text-sm text-gray-500 mt-1">제안: {issue.suggestion}</p>
              </div>
            );
          })}
        </div>
      )}

      {hasRun && issues.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center">
          <p className="text-sm text-gray-400">문제가 발견되지 않았습니다.</p>
        </div>
      )}
    </div>
  );
}
