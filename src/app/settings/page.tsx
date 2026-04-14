"use client";

import { useState, useEffect } from "react";

export default function SettingsPage() {
  const [categories, setCategories] = useState<string[]>([]);
  const [pageTemplate, setPageTemplate] = useState("");
  const [terminology, setTerminology] = useState<Record<string, string>>({});
  const [newCategory, setNewCategory] = useState("");
  const [newTermKey, setNewTermKey] = useState("");
  const [newTermValue, setNewTermValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configId, setConfigId] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        setConfigId(data.id);
        setCategories(data.categories || []);
        setPageTemplate(data.rules?.page_template || "");
        setTerminology(data.rules?.terminology || {});
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: configId,
        categories,
        rules: { page_template: pageTemplate, terminology },
      }),
    });
    setSaving(false);
  };

  const addCategory = () => {
    if (newCategory && !categories.includes(newCategory)) {
      setCategories([...categories, newCategory]);
      setNewCategory("");
    }
  };

  const addTerminology = () => {
    if (newTermKey && newTermValue) {
      setTerminology({ ...terminology, [newTermKey]: newTermValue });
      setNewTermKey("");
      setNewTermValue("");
    }
  };

  if (loading) return <p className="text-sm text-gray-400">로딩 중...</p>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">설정</h1>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-gray-900 text-white px-4 py-2 rounded text-sm hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>

      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="font-semibold mb-3">카테고리</h2>
          <div className="flex flex-wrap gap-2 mb-3">
            {categories.map((cat) => (
              <span key={cat} className="bg-gray-100 px-3 py-1 rounded text-sm flex items-center gap-1">
                {cat}
                <button
                  onClick={() => setCategories(categories.filter((c) => c !== cat))}
                  className="text-gray-400 hover:text-red-500 ml-1"
                >
                  x
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="새 카테고리"
              className="border rounded px-3 py-1 text-sm"
              onKeyDown={(e) => { if (e.key === "Enter") addCategory(); }}
            />
            <button onClick={addCategory} className="text-sm text-blue-600 hover:underline">추가</button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="font-semibold mb-3">페이지 템플릿</h2>
          <textarea
            value={pageTemplate}
            onChange={(e) => setPageTemplate(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm h-32 font-mono"
          />
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="font-semibold mb-3">용어 통일</h2>
          <div className="space-y-1 mb-3">
            {Object.entries(terminology).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2 text-sm">
                <span className="font-mono bg-gray-50 px-2 py-0.5 rounded">{key}</span>
                <span className="text-gray-400">=</span>
                <span>{value}</span>
                <button
                  onClick={() => {
                    const next = { ...terminology };
                    delete next[key];
                    setTerminology(next);
                  }}
                  className="text-gray-400 hover:text-red-500"
                >
                  x
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newTermKey}
              onChange={(e) => setNewTermKey(e.target.value)}
              placeholder="용어"
              className="border rounded px-3 py-1 text-sm w-32"
            />
            <input
              type="text"
              value={newTermValue}
              onChange={(e) => setNewTermValue(e.target.value)}
              placeholder="통일 표기"
              className="border rounded px-3 py-1 text-sm w-48"
            />
            <button onClick={addTerminology} className="text-sm text-blue-600 hover:underline">추가</button>
          </div>
        </div>
      </div>
    </div>
  );
}
