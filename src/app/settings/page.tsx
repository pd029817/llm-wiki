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
  const [termStatus, setTermStatus] = useState<"" | "saving" | "saved" | "error">("");
  const [catStatus, setCatStatus] = useState<"" | "saving" | "saved" | "error">("");

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

  const persistCategories = async (next: string[]) => {
    setCatStatus("saving");
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: configId,
        categories: next,
        rules: { page_template: pageTemplate, terminology },
      }),
    });
    if (res.ok) {
      setCatStatus("saved");
      setTimeout(() => setCatStatus(""), 1500);
    } else {
      setCatStatus("error");
    }
  };

  const addCategory = async () => {
    const trimmed = newCategory.trim();
    if (!trimmed || categories.includes(trimmed)) return;
    const next = [...categories, trimmed];
    setCategories(next);
    setNewCategory("");
    await persistCategories(next);
  };

  const removeCategory = async (cat: string) => {
    const next = categories.filter((c) => c !== cat);
    setCategories(next);
    await persistCategories(next);
  };

  const persistTerminology = async (next: Record<string, string>) => {
    setTermStatus("saving");
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: configId,
        categories,
        rules: { page_template: pageTemplate, terminology: next },
      }),
    });
    if (res.ok) {
      setTermStatus("saved");
      setTimeout(() => setTermStatus(""), 1500);
    } else {
      setTermStatus("error");
    }
  };

  const addTerminology = async () => {
    if (!newTermKey || !newTermValue) return;
    const next = { ...terminology, [newTermKey]: newTermValue };
    setTerminology(next);
    setNewTermKey("");
    setNewTermValue("");
    await persistTerminology(next);
  };

  const removeTerminology = async (key: string) => {
    const next = { ...terminology };
    delete next[key];
    setTerminology(next);
    await persistTerminology(next);
  };

  if (loading) return <p className="text-sm text-gray-500">로딩 중...</p>;

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
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">카테고리</h2>
            {catStatus === "saving" && <span className="text-xs text-gray-500">저장 중...</span>}
            {catStatus === "saved" && <span className="text-xs text-green-600">✓ 저장됨</span>}
            {catStatus === "error" && <span className="text-xs text-red-600">저장 실패</span>}
          </div>
          <p className="text-xs text-gray-500 mb-3">추가·삭제 시 자동으로 저장됩니다.</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {categories.map((cat) => (
              <span key={cat} className="bg-gray-100 px-3 py-1 rounded text-sm flex items-center gap-1">
                {cat}
                <button
                  onClick={() => removeCategory(cat)}
                  className="text-gray-400 hover:text-red-500 ml-1"
                  title="삭제"
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
              className="border rounded px-3 py-1 text-sm text-gray-900"
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
            className="w-full border rounded px-3 py-2 text-sm text-gray-900 h-32 font-mono"
          />
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">용어 통일</h2>
            {termStatus === "saving" && <span className="text-xs text-gray-500">저장 중...</span>}
            {termStatus === "saved" && <span className="text-xs text-green-600">✓ 저장됨</span>}
            {termStatus === "error" && <span className="text-xs text-red-600">저장 실패</span>}
          </div>
          <p className="text-xs text-gray-500 mb-3">추가·삭제 시 자동으로 저장됩니다.</p>
          <div className="space-y-1 mb-3">
            {Object.entries(terminology).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2 text-sm">
                <span className="font-mono bg-gray-50 px-2 py-0.5 rounded">{key}</span>
                <span className="text-gray-500">=</span>
                <span>{value}</span>
                <button
                  onClick={() => removeTerminology(key)}
                  className="text-gray-400 hover:text-red-500"
                  title="삭제"
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
              className="border rounded px-3 py-1 text-sm text-gray-900 w-32"
              onKeyDown={(e) => { if (e.key === "Enter") addTerminology(); }}
            />
            <input
              type="text"
              value={newTermValue}
              onChange={(e) => setNewTermValue(e.target.value)}
              placeholder="통일 표기"
              className="border rounded px-3 py-1 text-sm text-gray-900 w-48"
              onKeyDown={(e) => { if (e.key === "Enter") addTerminology(); }}
            />
            <button onClick={addTerminology} className="text-sm text-blue-600 hover:underline">추가</button>
          </div>
        </div>
      </div>
    </div>
  );
}
