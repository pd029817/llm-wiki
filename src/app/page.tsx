import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function Dashboard() {
  const supabase = await createClient();

  const [
    { count: pageCount },
    { count: sourceCount },
    { data: recentChanges },
  ] = await Promise.all([
    supabase.from("wiki_pages").select("*", { count: "exact", head: true }),
    supabase.from("raw_sources").select("*", { count: "exact", head: true }),
    supabase
      .from("change_log")
      .select("*, wiki_pages(title, slug)")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">대시보드</h1>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">위키 페이지</p>
          <p className="text-3xl font-bold">{pageCount || 0}</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">원본 소스</p>
          <p className="text-3xl font-bold">{sourceCount || 0}</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-500">빠른 작업</p>
          <div className="flex gap-2 mt-1">
            <Link href="/ingest" className="text-sm text-blue-600 hover:underline">업로드</Link>
            <Link href="/lint" className="text-sm text-blue-600 hover:underline">Lint</Link>
          </div>
        </div>
      </div>

      <h2 className="text-lg font-semibold mb-3">최근 변경</h2>
      <div className="bg-white rounded-lg shadow-sm">
        {recentChanges && recentChanges.length > 0 ? (
          <ul className="divide-y">
            {recentChanges.map((log) => (
              <li key={log.id} className="px-4 py-3 flex justify-between items-center">
                <div>
                  <Link
                    href={`/wiki/${(log as any).wiki_pages?.slug}`}
                    className="text-sm font-medium text-blue-600 hover:underline"
                  >
                    {(log as any).wiki_pages?.title}
                  </Link>
                  <p className="text-xs text-gray-500">{log.summary}</p>
                </div>
                <span className="text-xs text-gray-400">
                  {new Date(log.created_at).toLocaleDateString("ko-KR")}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-6 text-sm text-gray-400 text-center">변경 이력이 없습니다.</p>
        )}
      </div>
    </div>
  );
}
