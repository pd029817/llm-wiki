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
    let friendly = `Lint 실행 중 오류: ${message}`;
    if (/rate_limit_exceeded|tokens per day|TPD/i.test(message)) {
      friendly = "Groq 일일 토큰 한도(100K/day)를 초과했습니다. 매일 한국시간 오전 9시에 초기화됩니다. 한도를 늘리려면 console.groq.com → Settings → Billing 에서 Dev Tier로 업그레이드하세요.";
    } else if (/rate limit/i.test(message)) {
      friendly = "요청 빈도 제한에 걸렸습니다. 잠시 후 다시 시도하세요.";
    }
    return NextResponse.json(
      { issues: [], total_pages: pages.length, error: friendly },
      { status: 200 }
    );
  }
}

export const maxDuration = 60;
