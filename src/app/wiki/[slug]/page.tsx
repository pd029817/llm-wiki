import { createClient } from "@/lib/supabase/server";
import { MarkdownViewer } from "@/components/markdown-viewer";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function WikiPageDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const supabase = await createClient();

  const { data: page } = await supabase
    .from("wiki_pages")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!page) notFound();

  const { data: changelog } = await supabase
    .from("change_log")
    .select("*")
    .eq("page_id", page.id)
    .order("created_at", { ascending: false })
    .limit(5);

  let linkedPages: { title: string; slug: string }[] = [];
  if (page.linked_pages && page.linked_pages.length > 0) {
    const { data } = await supabase
      .from("wiki_pages")
      .select("title, slug")
      .in("id", page.linked_pages);
    linkedPages = data || [];
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Link href="/wiki" className="text-sm text-gray-500 hover:underline">위키</Link>
        <span className="text-sm text-gray-400">/</span>
      </div>

      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold">{page.title}</h1>
          <p className="text-xs text-gray-500 mt-1">
            {page.category && <span className="mr-3">{page.category}</span>}
            v{page.version} | 수정: {new Date(page.updated_at).toLocaleDateString("ko-KR")}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <MarkdownViewer content={page.content} />
      </div>

      {linkedPages.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-600 mb-2">관련 페이지</h2>
          <div className="flex flex-wrap gap-2">
            {linkedPages.map((lp) => (
              <Link
                key={lp.slug}
                href={`/wiki/${lp.slug}`}
                className="text-sm bg-gray-100 px-3 py-1 rounded hover:bg-gray-200"
              >
                {lp.title}
              </Link>
            ))}
          </div>
        </div>
      )}

      {changelog && changelog.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-600 mb-2">변경 이력</h2>
          <div className="bg-white rounded-lg shadow-sm divide-y">
            {changelog.map((log) => (
              <div key={log.id} className="px-4 py-2 flex justify-between">
                <span className="text-sm">{log.summary}</span>
                <span className="text-xs text-gray-500">
                  {new Date(log.created_at).toLocaleDateString("ko-KR")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
