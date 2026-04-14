import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runIngest } from "@/lib/claude";
import { SchemaConfig, WikiPage } from "@/lib/types";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();
  const { source_id } = body;

  // 1. 원본 문서 가져오기
  const { data: source, error: sourceError } = await supabase
    .from("raw_sources")
    .select("*")
    .eq("id", source_id)
    .single();

  if (sourceError || !source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  // 2. 기존 위키 페이지 목록
  const { data: existingPages } = await supabase
    .from("wiki_pages")
    .select("*");

  // 3. schema_config 가져오기
  const { data: config } = await supabase
    .from("schema_config")
    .select("*")
    .limit(1)
    .single();

  // 4. Claude API로 Ingest 실행
  const results = await runIngest(
    source.content || "",
    (existingPages || []) as WikiPage[],
    config as SchemaConfig
  );

  // 5. 결과를 DB에 반영
  const applied = [];
  for (const result of results) {
    if (result.action === "create") {
      const { data: newPage } = await supabase
        .from("wiki_pages")
        .insert({
          title: result.title,
          slug: result.slug,
          content: result.content,
          category: result.category,
          source_ids: [source_id],
        })
        .select()
        .single();

      if (newPage) {
        await supabase.from("change_log").insert({
          page_id: newPage.id,
          action: "created",
          summary: `Ingest: "${source.title}"에서 생성`,
        });
        applied.push({ action: "created", page: newPage });
      }
    } else if (result.action === "update") {
      const { data: existing } = await supabase
        .from("wiki_pages")
        .select("id, version, source_ids")
        .eq("slug", result.slug)
        .single();

      if (existing) {
        const updatedSourceIds = [...new Set([...(existing.source_ids || []), source_id])];
        const { data: updated } = await supabase
          .from("wiki_pages")
          .update({
            content: result.content,
            category: result.category,
            source_ids: updatedSourceIds,
            version: existing.version + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("slug", result.slug)
          .select()
          .single();

        if (updated) {
          await supabase.from("change_log").insert({
            page_id: existing.id,
            action: "updated",
            summary: `Ingest: "${source.title}"에서 업데이트`,
          });
          applied.push({ action: "updated", page: updated });
        }
      }
    }
  }

  return NextResponse.json({ results: applied });
}

export const maxDuration = 60;
