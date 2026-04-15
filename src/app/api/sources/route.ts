import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { saveOriginalSource, saveRawSourceMarkdown } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("raw_sources")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();

  const { data, error } = await supabase
    .from("raw_sources")
    .insert({
      title: body.title,
      content: body.content,
      mime_type: body.mime_type || "text/plain",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    const originalName: string = body.original_filename || body.title || `source-${Date.now()}`;
    if (body.original_base64) {
      await saveOriginalSource(originalName, body.original_base64);
    }
    if (body.content) {
      await saveRawSourceMarkdown(originalName, body.content);
    }
  } catch (e) {
    console.error("파일시스템 저장 실패 (sources/raw_sources):", e);
  }

  return NextResponse.json(data);
}
