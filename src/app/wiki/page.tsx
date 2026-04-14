"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { SearchBar } from "@/components/search-bar";
import { WikiPage } from "@/lib/types";

export default function WikiBrowser() {
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPages = async (query?: string) => {
    setLoading(true);
    const params = query ? `?q=${encodeURIComponent(query)}` : "";
    const res = await fetch(`/api/wiki${params}`);
    const data = await res.json();
    setPages(data);
    setLoading(false);
  };

  useEffect(() => { fetchPages(); }, []);

  const categories = [...new Set(pages.map((p) => p.category).filter(Boolean))];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">위키</h1>
      <div className="mb-6">
        <SearchBar onSearch={fetchPages} placeholder="위키 페이지 검색..." />
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">로딩 중...</p>
      ) : pages.length === 0 ? (
        <p className="text-sm text-gray-400">위키 페이지가 없습니다. 소스를 업로드하여 시작하세요.</p>
      ) : (
        <div>
          {categories.map((cat) => (
            <div key={cat} className="mb-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase mb-2">{cat}</h2>
              <div className="bg-white rounded-lg shadow-sm divide-y">
                {pages.filter((p) => p.category === cat).map((page) => (
                  <Link
                    key={page.id}
                    href={`/wiki/${page.slug}`}
                    className="block px-4 py-3 hover:bg-gray-50"
                  >
                    <span className="text-sm font-medium">{page.title}</span>
                    <span className="text-xs text-gray-400 ml-2">v{page.version}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
          {pages.filter((p) => !p.category).length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase mb-2">미분류</h2>
              <div className="bg-white rounded-lg shadow-sm divide-y">
                {pages.filter((p) => !p.category).map((page) => (
                  <Link
                    key={page.id}
                    href={`/wiki/${page.slug}`}
                    className="block px-4 py-3 hover:bg-gray-50"
                  >
                    <span className="text-sm font-medium">{page.title}</span>
                    <span className="text-xs text-gray-400 ml-2">v{page.version}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
