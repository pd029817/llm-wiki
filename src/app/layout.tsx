import type { Metadata } from "next";
import { Nav } from "@/components/nav";
import { SwCleanup } from "@/components/sw-cleanup";
import "./globals.css";

export const metadata: Metadata = {
  title: "LLM Wiki",
  description: "회사 지식 관리 시스템",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="flex">
        <SwCleanup />
        <Nav />
        <main className="flex-1 p-6 bg-gray-50 min-h-screen text-gray-900">
          {children}
        </main>
      </body>
    </html>
  );
}
