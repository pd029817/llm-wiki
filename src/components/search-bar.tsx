"use client";

import { useState } from "react";

export function SearchBar({ onSearch, placeholder = "검색..." }: { onSearch: (query: string) => void; placeholder?: string }) {
  const [query, setQuery] = useState("");

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSearch(query); }}
      className="flex gap-2"
    >
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="flex-1 border rounded px-3 py-2 text-sm text-gray-900"
      />
      <button type="submit" className="bg-gray-900 text-white px-4 py-2 rounded text-sm hover:bg-gray-800">
        검색
      </button>
    </form>
  );
}
