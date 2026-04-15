import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return base || `doc-${Date.now()}`;
}

function toMarkdown(title: string, content: string): string {
  const normalized = content
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const body = paragraphs
    .map((p) => {
      const headingMatch = p.match(/^(제\s*\d+\s*조[^\n]*)/);
      if (headingMatch && p.length < 200) return `## ${p}`;
      return p;
    })
    .join("\n\n");

  return `# ${title}\n\n${body}\n`;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { source_id } = body;

    const { data: source, error: sourceError } = await supabase
      .from("raw_sources")
      .select("*")
      .eq("id", source_id)
      .single();

    if (sourceError || !source) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    const rawTitle = (source.title || "문서").replace(/\.[a-z0-9]+$/i, "");
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
      const { data: updated, error: updateError } = await supabase
        .from("wiki_pages")
        .update({
          content: markdown,
          source_ids: updatedSourceIds,
          version: (existing.version || 0) + 1,
          updated_at: new Date().toISOString(),
        })
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
          category: null,
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

    return NextResponse.json({ results: [applied] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Ingest 실패" }, { status: 500 });
  }
}

export const maxDuration = 60;
