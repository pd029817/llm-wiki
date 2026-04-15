import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { promises as fs } from "fs";
import path from "path";
import RecentChangesTabs, { type RecentChange } from "./RecentChangesTabs";

type LintIssue = { page_slug: string; issue_type: string; description: string; suggestion: string };
type LintReport = { generated_at: string; total_pages: number; issues: LintIssue[] };

async function loadLintReport(): Promise<LintReport | null> {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), "lint-report.json"), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function daysAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export default async function Dashboard() {
  const supabase = await createClient();

  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { count: pageCount },
    { count: sourceCount },
    { count: chatCount },
    { count: pagesUpdated7d },
    { count: sourcesAdded7d },
    { count: changes30d },
    { data: recentChanges },
    { data: topPages },
    { data: staleCandidates },
    { data: categoryRows },
    lintReport,
  ] = await Promise.all([
    supabase.from("wiki_pages").select("*", { count: "exact", head: true }),
    supabase.from("raw_sources").select("*", { count: "exact", head: true }),
    supabase.from("chat_sessions").select("*", { count: "exact", head: true }),
    supabase.from("wiki_pages").select("*", { count: "exact", head: true }).gte("updated_at", since7d),
    supabase.from("raw_sources").select("*", { count: "exact", head: true }).gte("created_at", since7d),
    supabase.from("change_log").select("*", { count: "exact", head: true }).gte("created_at", since30d),
    supabase
      .from("change_log")
      .select("*, wiki_pages(title, slug, category)")
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("wiki_pages")
      .select("title, slug, version, updated_at")
      .order("version", { ascending: false })
      .limit(5),
    supabase
      .from("wiki_pages")
      .select("title, slug, updated_at")
      .order("updated_at", { ascending: true })
      .limit(5),
    supabase.from("wiki_pages").select("category"),
    loadLintReport(),
  ]);

  const categoryCounts = (categoryRows || []).reduce<Record<string, number>>((acc, row: any) => {
    const key = row.category || "미분류";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const topCategories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const issueTypeCounts = (lintReport?.issues || []).reduce<Record<string, number>>((acc, i) => {
    acc[i.issue_type] = (acc[i.issue_type] || 0) + 1;
    return acc;
  }, {});
  const totalIssues = lintReport?.issues.length || 0;
  const lintGeneratedDays = lintReport ? daysAgo(lintReport.generated_at) : null;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">대시보드</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Link href="/wiki" className="bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-sm text-gray-600">위키 페이지</p>
          <p className="text-3xl font-bold text-blue-600">{pageCount || 0}</p>
          <p className="text-xs text-gray-500 mt-1">7일 내 수정 {pagesUpdated7d || 0}건</p>
        </Link>
        <Link href="/sources" className="bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-sm text-gray-600">원본 소스</p>
          <p className="text-3xl font-bold text-blue-600">{sourceCount || 0}</p>
          <p className="text-xs text-gray-500 mt-1">7일 내 신규 {sourcesAdded7d || 0}건</p>
        </Link>
        <Link href="/chat" className="bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-sm text-gray-600">질의 세션</p>
          <p className="text-3xl font-bold text-blue-600">{chatCount || 0}</p>
          <p className="text-xs text-gray-500 mt-1">30일 변경 {changes30d || 0}건</p>
        </Link>
        <Link href="/lint" className="bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-sm text-gray-600">Lint 이슈</p>
          <p className={`text-3xl font-bold ${totalIssues > 0 ? "text-amber-600" : "text-emerald-600"}`}>
            {totalIssues}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {lintGeneratedDays === null ? "리포트 없음" : `${lintGeneratedDays}일 전 생성`}
          </p>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Lint 인사이트</h2>
            <Link href="/lint" className="text-xs text-blue-600 hover:underline">상세 →</Link>
          </div>
          {totalIssues > 0 ? (
            <ul className="space-y-1.5">
              {Object.entries(issueTypeCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => (
                  <li key={type} className="flex justify-between text-sm">
                    <span className="text-gray-700">{type}</span>
                    <span className="font-medium text-gray-900">{count}</span>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">이슈가 없거나 리포트가 아직 생성되지 않았습니다.</p>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">카테고리 분포</h2>
            <Link href="/wiki" className="text-xs text-blue-600 hover:underline">전체 →</Link>
          </div>
          {topCategories.length > 0 ? (
            <ul className="space-y-1.5">
              {topCategories.map(([cat, count]) => {
                const pct = pageCount ? Math.round((count / pageCount) * 100) : 0;
                return (
                  <li key={cat} className="text-sm">
                    <div className="flex justify-between mb-0.5">
                      <span className="text-gray-700 truncate">{cat}</span>
                      <span className="text-gray-600">{count} · {pct}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded">
                      <div className="h-1.5 bg-blue-500 rounded" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">카테고리 데이터가 없습니다.</p>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">편집 많은 페이지</h2>
            <Link href="/wiki" className="text-xs text-blue-600 hover:underline">전체 →</Link>
          </div>
          {topPages && topPages.length > 0 ? (
            <ul className="space-y-1.5">
              {topPages.map((p: any) => (
                <li key={p.slug} className="flex justify-between text-sm gap-2">
                  <Link href={`/wiki/${p.slug}`} className="text-blue-600 hover:underline truncate">
                    {p.title}
                  </Link>
                  <span className="text-gray-500 shrink-0">v{p.version}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">페이지가 없습니다.</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RecentChangesTabs
          changes={((recentChanges || []) as any[]).map<RecentChange>((log) => ({
            id: log.id,
            created_at: log.created_at,
            summary: log.summary,
            category: log.wiki_pages?.category || "미분류",
            page_title: log.wiki_pages?.title ?? null,
            page_slug: log.wiki_pages?.slug ?? null,
          }))}
        />

        <div className="bg-white rounded-lg shadow-sm">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">업데이트 필요 (오래된 페이지)</h2>
            <Link href="/wiki" className="text-xs text-blue-600 hover:underline">전체 →</Link>
          </div>
          {staleCandidates && staleCandidates.length > 0 ? (
            <ul className="divide-y">
              {staleCandidates.map((p: any) => (
                <li key={p.slug} className="px-4 py-3 flex justify-between items-center gap-3">
                  <Link
                    href={`/wiki/${p.slug}`}
                    className="text-sm font-medium text-blue-600 hover:underline truncate"
                  >
                    {p.title}
                  </Link>
                  <span className="text-xs text-gray-500 shrink-0">
                    {daysAgo(p.updated_at)}일 전
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-sm text-gray-500 text-center">페이지가 없습니다.</p>
          )}
        </div>
      </div>
    </div>
  );
}
