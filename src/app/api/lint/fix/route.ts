import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface LintIssue {
  page_slug: string;
  issue_type: string;
  description: string;
  suggestion: string;
}

function extractLinks(suggestion: string): { title: string; slug: string }[] {
  const links: { title: string; slug: string }[] = [];
  const seen = new Set<string>();
  const mdRe = /\[([^\]]+)\]\(\/wiki\/([^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = mdRe.exec(suggestion)) !== null) {
    const slug = decodeURIComponent(m[2].trim());
    if (seen.has(slug)) continue;
    seen.add(slug);
    links.push({ title: m[1].trim(), slug });
  }
  const wikiRe = /\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g;
  while ((m = wikiRe.exec(suggestion)) !== null) {
    const slug = m[1].trim();
    if (seen.has(slug)) continue;
    seen.add(slug);
    links.push({ title: (m[2] ?? slug).trim(), slug });
  }
  return links;
}

function ensureRelatedSection(content: string, links: { title: string; slug: string }[]): string {
  if (links.length === 0) return content;

  const body = content.replace(/\s+$/, "");
  const sectionRe = /(^|\n)##\s+관련\s*(문서|항목|페이지)\s*\n/;
  const match = body.match(sectionRe);

  const newLines = links
    .filter((l) => !body.includes(`/wiki/${l.slug}`) && !body.includes(`/wiki/${encodeURIComponent(l.slug)}`))
    .map((l) => `- [${l.title}](/wiki/${l.slug})`);

  if (newLines.length === 0) return content;

  if (match) {
    const idx = match.index! + match[0].length;
    const before = body.slice(0, idx);
    const after = body.slice(idx);
    return `${before}${newLines.join("\n")}\n${after}\n`;
  }

  return `${body}\n\n## 관련 문서\n${newLines.join("\n")}\n`;
}

function updateStale(content: string, suggestion: string, description: string): string {
  const today = new Date().toISOString().slice(0, 10);
  let updated = content;

  const statusMatch = suggestion.match(/'상태'\s*메타데이터를\s*'([^']+)'로/);
  if (statusMatch) {
    const newStatus = statusMatch[1];
    updated = updated.replace(/(상태\s*[::]\s*)[^\n]+/g, `$1${newStatus}`);
  }

  const hasLastUpdated = /(최종\s*업데이트|최종\s*수정|Last\s*updated)\s*[::]/i.test(updated);
  if (hasLastUpdated) {
    updated = updated.replace(
      /((?:최종\s*업데이트|최종\s*수정|Last\s*updated)\s*[::]\s*)[0-9]{4}[-./][0-9]{1,2}[-./][0-9]{1,2}/gi,
      `$1${today}`
    );
  } else {
    updated = `${updated.replace(/\s+$/, "")}\n\n> 최종 업데이트: ${today}\n`;
  }

  const note = `\n\n> ⚠️ Lint 자동 갱신(${today}): ${description.replace(/\s+/g, " ").trim()} — ${suggestion.replace(/\s+/g, " ").trim()}\n`;
  if (!updated.includes("Lint 자동 갱신")) {
    updated = `${updated.replace(/\s+$/, "")}${note}`;
  }

  return updated;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const issue = (await request.json()) as LintIssue;
  const { page_slug, issue_type, description, suggestion } = issue;

  const candidates = Array.from(
    new Set([page_slug, page_slug?.normalize("NFC"), page_slug?.normalize("NFD")].filter(Boolean))
  );

  let page: { slug: string; title: string; category: string; content: string } | null = null;
  for (const s of candidates) {
    const { data } = await supabase.from("wiki_pages").select("*").eq("slug", s).maybeSingle();
    if (data) {
      page = data;
      break;
    }
  }

  if (!page) return NextResponse.json({ error: "페이지를 찾을 수 없습니다." }, { status: 404 });

  let proposed: string;
  if (issue_type === "orphan") {
    return NextResponse.json(
      {
        error:
          "'orphan' 유형은 다른 페이지를 수정해야 하므로 자동 수정이 불가합니다. [편집] 버튼으로 상위/형제 페이지에 링크를 추가해 주세요.",
      },
      { status: 422 }
    );
  } else if (issue_type === "missing_link") {
    const links = extractLinks(suggestion);
    if (links.length === 0) {
      return NextResponse.json(
        { error: "suggestion에서 링크를 파싱하지 못했습니다. 수동으로 편집해 주세요." },
        { status: 422 }
      );
    }
    proposed = ensureRelatedSection(page.content, links);
  } else if (issue_type === "stale") {
    proposed = updateStale(page.content, suggestion, description);
  } else {
    return NextResponse.json(
      {
        error: `'${issue_type}' 유형은 규칙 기반 자동 수정이 불가합니다. [편집] 버튼으로 직접 수정해 주세요.`,
      },
      { status: 422 }
    );
  }

  if (proposed.trim() === page.content.trim()) {
    return NextResponse.json(
      { error: "이미 제안된 변경 사항이 본문에 반영되어 있습니다." },
      { status: 422 }
    );
  }

  return NextResponse.json({
    slug: page.slug,
    title: page.title,
    category: page.category,
    original_content: page.content,
    proposed_content: proposed,
  });
}

export const maxDuration = 10;
