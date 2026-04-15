"use client";

import { useState, useCallback } from "react";

export function FileUpload({ onFileSelect }: { onFileSelect: (file: File) => void }) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onFileSelect(file);
  }, [onFileSelect]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer ${
        dragOver ? "border-blue-500 bg-blue-50" : "border-gray-300"
      }`}
    >
      <p className="text-sm text-gray-600 mb-2">파일을 드래그하거나 클릭하여 업로드</p>
      <input
        type="file"
        onChange={(e) => { if (e.target.files?.[0]) onFileSelect(e.target.files[0]); }}
        className="hidden"
        id="file-input"
        accept=".txt,.md,.pdf,.doc,.docx"
      />
      <label htmlFor="file-input" className="text-sm text-blue-600 hover:underline cursor-pointer">
        파일 선택
      </label>
      <p className="mt-2 text-xs text-gray-500">
        지원 형식: .txt, .md, .pdf, .docx (PDF 내 이미지는 OCR로 추출, 구형 .doc는 .docx로 저장 후 업로드)
      </p>
    </div>
  );
}
