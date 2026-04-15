import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runLint } from "@/lib/llm";
import { SchemaConfig, WikiPage } from "@/lib/types";

export async function POST() {
  const supabase = await createClient();

  const { data: pages } = await supabase
    .from("wiki_pages")
    .select("*");

  if (!pages || pages.length === 0) {
    return NextResponse.json({ issues: [], message: "위키 페이지가 없습니다." });
  }

  const { data: config } = await supabase
    .from("schema_config")
    .select("*")
    .limit(1)
    .single();

  try {
    const issues = await runLint(
      pages as WikiPage[],
      config as SchemaConfig
    );
    return NextResponse.json({ issues, total_pages: pages.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { issues: [], total_pages: pages.length, error: `Lint 실행 중 오류: ${message}` },
      { status: 200 }
    );
  }
}

export const maxDuration = 60;
