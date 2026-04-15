"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "대시보드" },
  { href: "/wiki", label: "위키" },
  { href: "/ingest", label: "소스 업로드" },
  { href: "/sources", label: "원본 소스" },
  { href: "/query", label: "질의" },
  { href: "/chat", label: "챗봇" },
  { href: "/lint", label: "Lint" },
  { href: "/settings", label: "설정" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="w-56 min-h-screen bg-gray-900 text-white p-4 flex flex-col gap-1">
      <h1 className="text-lg font-bold mb-6 px-3">LLM Wiki</h1>
      {navItems.map((item) => {
        const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-2 rounded text-sm ${
              isActive ? "bg-gray-700 font-medium" : "hover:bg-gray-800"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
