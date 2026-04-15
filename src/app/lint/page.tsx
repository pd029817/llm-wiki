"use client";

import { useState } from "react";
import { diffLines } from "diff";

interface LintIssue {
  page_slug: string;
  issue_type: string;
  description: string;
  suggestion: string;
}

interface FixProposal {
  slug: string;
  title: string;
  category: string;
  original_content: string;
  proposed_content: string;
}

function renderDiffLines(original: string, modified: string, side: "left" | "right") {
  const parts = diffLines(original, modified);
  const keep = side === "left" ? (p: { added?: boolean }) => !p.added : (p: { removed?: boolean }) => !p.removed;
  const changedClass = side === "left"
    ? "bg-red-100 text-red-900"
    : "bg-green-100 text-green-900";
  return parts.filter(keep).map((p, idx) => {
    const changed = side === "left" ? p.removed : p.added;
    const lines = p.value.split("\n");
    if (lines[lines.length - 1] === "") lines.pop();
    return lines.map((ln, j) => (
      <div
        key={`${idx}-${j}`}
        className={changed ? `${changedClass} whitespace-pre-wrap` : "whitespace-pre-wrap text-gray-800"}
      >
        {ln || "\u00A0"}
      </div>
    ));
  });
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
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [fixingIndex, setFixingIndex] = useState<number | null>(null);
  const [proposals, setProposals] = useState<Record<number, FixProposal>>({});
  const [applyingIndex, setApplyingIndex] = useState<number | null>(null);
  const [appliedIndexes, setAppliedIndexes] = useState<Set<number>>(new Set());
  const [editedContent, setEditedContent] = useState<Record<number, string>>({});
  const [editMode, setEditMode] = useState<Record<number, boolean>>({});
  const [dismissedIndexes, setDismissedIndexes] = useState<Set<number>>(new Set());
  const [modalMessage, setModalMessage] = useState<string | null>(null);

  const handleLint = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/lint", { method: "POST" });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      setIssues(data.issues || []);
      setTotalPages(data.total_pages || 0);
      setGeneratedAt(data.generated_at || null);
      if (data.error) setModalMessage(data.error);
    } catch (e) {
      setModalMessage(`Lint 요청 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
    setHasRun(true);
    setLoading(false);
    setProposals({});
    setAppliedIndexes(new Set());
    setEditedContent({});
    setDismissedIndexes(new Set());
  };

  const handleKeepOriginal = (i: number) => {
    setDismissedIndexes((s) => new Set(s).add(i));
    setProposals((p) => {
      const n = { ...p };
      delete n[i];
      return n;
    });
  };

  const handleProposeFix = async (i: number, issue: LintIssue) => {
    setFixingIndex(i);
    try {
      const res = await fetch("/api/lint/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(issue),
      });
      const text = await res.text();
      const data = text ? (() => { try { return JSON.parse(text); } catch { return { error: text }; } })() : {};
      if (res.ok) {
        setProposals((p) => ({ ...p, [i]: data }));
        setEditedContent((e) => ({ ...e, [i]: data.proposed_content }));
      } else {
        setModalMessage(`수정 제안 실패 (${res.status}): ${data.error || "알 수 없는 오류"}`);
      }
    } catch (e) {
      setModalMessage(`수정 제안 요청 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setFixingIndex(null);
    }
  };

  const handleApply = async (i: number) => {
    const proposal = proposals[i];
    if (!proposal) return;
    setApplyingIndex(i);
    const res = await fetch(`/api/wiki/${encodeURIComponent(proposal.slug)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: proposal.title,
        category: proposal.category,
        content: editedContent[i] ?? proposal.proposed_content,
      }),
    });
    if (res.ok) {
      setAppliedIndexes((s) => new Set(s).add(i));
    } else {
      const data = await res.json();
      setModalMessage(`적용 실패: ${data.error || res.status}`);
    }
    setApplyingIndex(null);
  };

  const handleDiscard = (i: number) => {
    setProposals((p) => {
      const n = { ...p };
      delete n[i];
      return n;
    });
    setEditedContent((e) => {
      const n = { ...e };
      delete n[i];
      return n;
    });
  };

  return (
    <div>
      {modalMessage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setModalMessage(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-gray-900 mb-3">알림</h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap mb-5">{modalMessage}</p>
            <div className="flex justify-end">
              <button
                onClick={() => setModalMessage(null)}
                className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

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
        <div className="mb-4 text-sm text-gray-600">
          {totalPages}개 페이지 점검 완료 | {issues.length}건 발견
          {generatedAt && (
            <span className="ml-2 text-gray-400">· 리포트 생성: {new Date(generatedAt).toLocaleString("ko-KR")}</span>
          )}
        </div>
      )}

      {issues.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm divide-y">
          {issues.map((issue, i) => {
            const typeInfo = issueTypeLabels[issue.issue_type] || { label: issue.issue_type, color: "bg-gray-100 text-gray-700" };
            const proposal = proposals[i];
            const applied = appliedIndexes.has(i);
            const dismissed = dismissedIndexes.has(i);

            return (
              <div key={i} className="px-4 py-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${typeInfo.color}`}>
                    {typeInfo.label}
                  </span>
                  <a href={`/wiki/${encodeURIComponent(issue.page_slug)}`} className="text-sm text-blue-600 hover:underline">
                    {issue.page_slug}
                  </a>
                  <div className="ml-auto flex gap-2">
                    {!proposal && !applied && !dismissed && (
                      <>
                        <button
                          onClick={() => handleProposeFix(i, issue)}
                          disabled={fixingIndex === i}
                          className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
                        >
                          {fixingIndex === i ? "생성 중..." : "수정 제안"}
                        </button>
                        <button
                          onClick={() => handleKeepOriginal(i)}
                          className="text-xs border border-gray-300 text-gray-700 px-3 py-1 rounded hover:bg-gray-50"
                          title="이 이슈를 무시하고 원본을 그대로 유지합니다"
                        >
                          원본 유지
                        </button>
                      </>
                    )}
                    {applied && (
                      <span className="text-xs text-green-700 font-medium">✓ 적용됨</span>
                    )}
                    {dismissed && (
                      <span className="text-xs text-gray-500 font-medium">— 원본 유지</span>
                    )}
                  </div>
                </div>
                <p className="text-sm text-gray-700">{issue.description}</p>
                <p className="text-sm text-gray-600 mt-1">제안: {issue.suggestion}</p>

                {proposal && !applied && (
                  <div className="mt-3 border-t pt-3">
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <h3 className="text-xs font-semibold text-gray-600 mb-1">
                          원본 <span className="text-red-700 font-normal">(빨강: 삭제된 부분)</span>
                        </h3>
                        <div className="text-xs bg-gray-50 border rounded p-2 h-64 overflow-auto font-mono leading-5">
                          {renderDiffLines(proposal.original_content, editedContent[i] ?? proposal.proposed_content, "left")}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="text-xs font-semibold text-gray-600">
                            수정 제안 <span className="text-green-700 font-normal">(초록: 추가된 부분)</span>
                          </h3>
                          <button
                            onClick={() => setEditMode((m) => ({ ...m, [i]: !m[i] }))}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            {editMode[i] ? "Diff 보기" : "편집"}
                          </button>
                        </div>
                        {editMode[i] ? (
                          <textarea
                            value={editedContent[i] ?? proposal.proposed_content}
                            onChange={(e) => setEditedContent((prev) => ({ ...prev, [i]: e.target.value }))}
                            className="w-full text-xs border rounded p-2 h-64 font-mono text-gray-900"
                          />
                        ) : (
                          <div className="text-xs bg-gray-50 border rounded p-2 h-64 overflow-auto font-mono leading-5">
                            {renderDiffLines(proposal.original_content, editedContent[i] ?? proposal.proposed_content, "right")}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end items-center">
                      <span className="text-xs text-gray-500 mr-auto">
                        💡 제안이 틀렸다면 [원본 유지]로 이슈를 무시하거나, [편집]으로 일부만 수정하세요
                      </span>
                      <button
                        onClick={() => handleKeepOriginal(i)}
                        className="text-xs bg-gray-700 text-white px-3 py-1 rounded hover:bg-gray-800"
                      >
                        원본 유지
                      </button>
                      <button
                        onClick={() => handleDiscard(i)}
                        className="text-xs border border-gray-300 text-gray-700 px-3 py-1 rounded hover:bg-gray-50"
                      >
                        취소
                      </button>
                      <button
                        onClick={() => handleApply(i)}
                        disabled={applyingIndex === i}
                        className="text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 disabled:opacity-50"
                      >
                        {applyingIndex === i ? "적용 중..." : "적용"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {hasRun && issues.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center">
          <p className="text-sm text-gray-500">문제가 발견되지 않았습니다.</p>
        </div>
      )}
    </div>
  );
}
