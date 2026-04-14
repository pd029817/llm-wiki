import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("wiki_pages")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const body = await request.json();

  const { data: existing } = await supabase
    .from("wiki_pages")
    .select("id, version, content")
    .eq("slug", slug)
    .single();

  if (!existing) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("wiki_pages")
    .update({
      title: body.title,
      content: body.content,
      category: body.category,
      linked_pages: body.linked_pages,
      version: existing.version + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("slug", slug)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("change_log").insert({
    page_id: existing.id,
    action: "updated",
    summary: `수동 편집 (v${existing.version} → v${existing.version + 1})`,
    diff: body.content,
  });

  return NextResponse.json(data);
}
