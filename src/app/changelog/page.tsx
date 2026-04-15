import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function ChangelogPage() {
  const supabase = await createClient();
  const { data: changes } = await supabase
    .from("change_log")
    .select("*, wiki_pages(title, slug, category)")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">변경 이력</h1>
      <div className="bg-white rounded-lg shadow-sm">
        {changes && changes.length > 0 ? (
          <ul className="divide-y">
            {changes.map((log: any) => (
              <li key={log.id} className="px-4 py-3 flex justify-between items-center gap-3">
                <div className="min-w-0">
                  {log.wiki_pages?.slug ? (
                    <Link
                      href={`/wiki/${log.wiki_pages.slug}`}
                      className="text-sm font-medium text-blue-600 hover:underline truncate block"
                    >
                      {log.wiki_pages.title}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium text-gray-500">(삭제된 페이지)</span>
                  )}
                  <p className="text-xs text-gray-600 truncate">
                    <span className="inline-block px-1.5 py-0.5 mr-1.5 text-[10px] bg-gray-100 text-gray-700 rounded">
                      {log.wiki_pages?.category || "미분류"}
                    </span>
                    <span className="inline-block px-1.5 py-0.5 mr-1.5 text-[10px] bg-blue-50 text-blue-700 rounded">
                      {log.action}
                    </span>
                    {log.summary}
                  </p>
                </div>
                <span className="text-xs text-gray-500 shrink-0">
                  {new Date(log.created_at).toLocaleString("ko-KR")}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-6 text-sm text-gray-500 text-center">변경 이력이 없습니다.</p>
        )}
      </div>
    </div>
  );
}
