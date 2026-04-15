"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type RecentChange = {
  id: string;
  created_at: string;
  summary: string | null;
  category: string;
  page_title: string | null;
  page_slug: string | null;
};

export default function RecentChangesTabs({ changes }: { changes: RecentChange[] }) {
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of changes) counts.set(c.category, (counts.get(c.category) || 0) + 1);
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    return [{ key: "__all__", label: "전체", count: changes.length }, ...sorted.map(([label, count]) => ({ key: label, label, count }))];
  }, [changes]);

  const [active, setActive] = useState<string>("__all__");

  const filtered = active === "__all__" ? changes : changes.filter((c) => c.category === active);

  return (
    <div className="bg-white rounded-lg shadow-sm">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">최근 변경</h2>
        <Link href="/changelog" className="text-xs text-blue-600 hover:underline">전체 →</Link>
      </div>

      <div className="px-2 pt-2 border-b overflow-x-auto">
        <div className="flex gap-1">
          {categories.map((cat) => {
            const isActive = active === cat.key;
            return (
              <button
                key={cat.key}
                onClick={() => setActive(cat.key)}
                className={`px-3 py-1.5 text-xs rounded-t-md whitespace-nowrap transition-colors ${
                  isActive
                    ? "bg-blue-50 text-blue-700 font-semibold border-b-2 border-blue-600 -mb-px"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                {cat.label}
                <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${
                  isActive ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
                }`}>
                  {cat.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length > 0 ? (
        <ul className="divide-y">
          {filtered.map((log) => (
            <li key={log.id} className="px-4 py-3 flex justify-between items-center gap-3">
              <div className="min-w-0">
                {log.page_slug ? (
                  <Link
                    href={`/wiki/${log.page_slug}`}
                    className="text-sm font-medium text-blue-600 hover:underline truncate block"
                  >
                    {log.page_title}
                  </Link>
                ) : (
                  <span className="text-sm font-medium text-gray-500">(삭제된 페이지)</span>
                )}
                <p className="text-xs text-gray-600 truncate">
                  <span className="inline-block px-1.5 py-0.5 mr-1.5 text-[10px] bg-gray-100 text-gray-700 rounded">
                    {log.category}
                  </span>
                  {log.summary}
                </p>
              </div>
              <span className="text-xs text-gray-500 shrink-0">
                {new Date(log.created_at).toLocaleDateString("ko-KR")}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-6 text-sm text-gray-500 text-center">해당 카테고리의 변경 이력이 없습니다.</p>
      )}
    </div>
  );
}
