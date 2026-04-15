import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toMarkdown, stripExtension } from "@/lib/markdown";
import { saveWikiMarkdown } from "@/lib/storage";

export const runtime = "nodejs";

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return base || `doc-${Date.now()}`;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { source_id, category } = body;
    const normalizedCategory =
      typeof category === "string" && category.trim() ? category.trim() : null;

    const { data: source, error: sourceError } = await supabase
      .from("raw_sources")
      .select("*")
      .eq("id", source_id)
      .single();

    if (sourceError || !source) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    const rawTitle = stripExtension(source.title || "문서");
    const slug = slugify(source.title || rawTitle);
    const markdown = toMarkdown(rawTitle, source.content || "");

    const { data: existing } = await supabase
      .from("wiki_pages")
      .select("id, version, source_ids")
      .eq("slug", slug)
      .maybeSingle();

    let applied: { action: string; page: { id: string; title: string; slug: string } } | null = null;

    if (existing) {
      const updatedSourceIds = [...new Set([...(existing.source_ids || []), source_id])];
      const updatePayload: Record<string, unknown> = {
        content: markdown,
        source_ids: updatedSourceIds,
        version: (existing.version || 0) + 1,
        updated_at: new Date().toISOString(),
      };
      if (normalizedCategory) updatePayload.category = normalizedCategory;
      const { data: updated, error: updateError } = await supabase
        .from("wiki_pages")
        .update(updatePayload)
        .eq("slug", slug)
        .select()
        .single();

      if (updateError || !updated) {
        return NextResponse.json({ error: updateError?.message || "업데이트 실패" }, { status: 500 });
      }

      await supabase.from("change_log").insert({
        page_id: existing.id,
        action: "updated",
        summary: `Ingest: "${source.title}"에서 업데이트`,
      });

      applied = { action: "updated", page: updated };
    } else {
      const { data: newPage, error: insertError } = await supabase
        .from("wiki_pages")
        .insert({
          title: rawTitle,
          slug,
          content: markdown,
          category: normalizedCategory,
          source_ids: [source_id],
        })
        .select()
        .single();

      if (insertError || !newPage) {
        return NextResponse.json({ error: insertError?.message || "생성 실패" }, { status: 500 });
      }

      await supabase.from("change_log").insert({
        page_id: newPage.id,
        action: "created",
        summary: `Ingest: "${source.title}"에서 생성`,
      });

      applied = { action: "created", page: newPage };
    }

    try {
      await saveWikiMarkdown(slug, markdown);
    } catch (e) {
      console.error("파일시스템 저장 실패 (wiki):", e);
    }

    return NextResponse.json({ results: [applied] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Ingest 실패" }, { status: 500 });
  }
}

export const maxDuration = 60;
