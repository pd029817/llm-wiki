import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });
const MODEL = "llama-3.3-70b-versatile";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { page_slug, issue_type, description, suggestion } = await request.json();

  const { data: page } = await supabase
    .from("wiki_pages")
    .select("*")
    .eq("slug", page_slug)
    .single();

  if (!page) return NextResponse.json({ error: "페이지를 찾을 수 없습니다." }, { status: 404 });

  const { data: allPages } = await supabase
    .from("wiki_pages")
    .select("title, slug");

  const pageList = (allPages || [])
    .map((p: { title: string; slug: string }) => `- ${p.title} (${p.slug})`)
    .join("\n");

  const system = `당신은 위키 편집자입니다. 주어진 Lint 이슈를 해결하도록 위키 페이지의 마크다운 내용만 수정하여 반환하세요.
규칙:
- 전체 페이지 마크다운 내용만 반환 (설명, 코드펜스 금지)
- 기존 내용의 의미와 구조는 최대한 유지
- 크로스레퍼런스는 [[페이지슬러그]] 또는 [제목](/wiki/슬러그) 형식
- 이슈 유형별:
  * contradiction: 모순되는 문장을 정확히 수정
  * stale: 최신 상태 반영 (날짜/버전 업데이트 표시)
  * orphan: 관련 페이지로의 링크를 자연스럽게 추가
  * missing_link: 누락된 크로스레퍼런스 삽입`;

  const user = `페이지 제목: ${page.title}
슬러그: ${page.slug}
카테고리: ${page.category}

현재 내용:
${page.content}

Lint 이슈:
- 유형: ${issue_type}
- 설명: ${description}
- 제안: ${suggestion}

전체 위키 페이지 목록 (링크 후보):
${pageList}

수정된 전체 마크다운을 반환하세요:`;

  const res = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const proposed = res.choices[0]?.message?.content?.trim() || "";
  const cleaned = proposed.replace(/^```(?:markdown|md)?\n?|\n?```$/g, "").trim();

  return NextResponse.json({
    slug: page.slug,
    title: page.title,
    category: page.category,
    original_content: page.content,
    proposed_content: cleaned,
  });
}

export const maxDuration = 30;
