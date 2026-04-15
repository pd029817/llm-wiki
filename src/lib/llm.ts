import Groq from "groq-sdk";
import { SchemaConfig, WikiPage } from "./types";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });
const MODEL = "llama-3.3-70b-versatile";

function buildSystemPrompt(config: SchemaConfig, operation: "ingest" | "query" | "lint" | "chat"): string {
  const baseRules = `위키 규칙:\n- 카테고리: ${config.categories.join(", ")}\n- 페이지 템플릿:\n${config.rules.page_template}`;
  const terminology = Object.entries(config.rules.terminology)
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join("\n");
  const termSection = terminology ? `\n- 용어 통일:\n${terminology}` : "";

  const prompts = {
    ingest: `당신은 위키 관리자입니다. 다음 원본 문서를 읽고, 기존 위키 페이지 목록을 참고하여, 신규 페이지 생성 또는 기존 페이지 업데이트를 마크다운으로 출력하세요. 관련 페이지 간 크로스레퍼런스를 [[페이지슬러그]] 형식으로 반드시 포함하세요.\n\n응답은 반드시 다음 JSON 형식으로:\n[{"action": "create"|"update", "slug": "페이지-슬러그", "title": "페이지 제목", "category": "카테고리", "content": "마크다운 내용"}]`,
    query: `다음 위키 페이지들을 참고하여 질문에 답하세요. 반드시 출처 페이지를 [페이지제목](/wiki/슬러그) 형식으로 인용하세요. 위키에 없는 내용은 추측하지 마세요.`,
    lint: `다음 위키 페이지들을 검토하여 문제를 찾아 리포트하세요.\n검토 항목: 모순되는 내용, 오래된 정보, 고아 페이지(다른 페이지에서 링크되지 않음), 누락된 크로스레퍼런스.\n\n응답은 반드시 다음 JSON 형식으로:\n[{"page_slug": "슬러그", "issue_type": "contradiction"|"stale"|"orphan"|"missing_link", "description": "설명", "suggestion": "수정 제안"}]`,
    chat: `당신은 회사 지식 관리 위키 기반 어시스턴트입니다.\n\n엄격한 규칙:\n1. 오직 아래 "참고할 위키 페이지"에 포함된 내용만을 근거로 답하세요.\n2. 위키에 없는 정보는 추측·일반지식·외부지식으로 절대 보충하지 마세요.\n3. 위키에 관련 정보가 없으면 반드시 "위키에 해당 정보가 없습니다."라고만 답하세요.\n4. 답변시 반드시 출처 페이지를 [페이지제목](/wiki/슬러그) 형식으로 인용하세요.\n5. 위키 내용을 그대로 혹은 최소 편집으로만 제시하세요 — 스스로 재구성하거나 창작하지 마세요.`,
  };

  return `${prompts[operation]}\n\n${baseRules}${termSection}`;
}

function formatWikiContext(pages: WikiPage[]): string {
  return pages
    .map((p) => `--- 위키 페이지: ${p.title} (slug: ${p.slug}, 카테고리: ${p.category}) ---\n${p.content}`)
    .join("\n\n");
}

async function complete(system: string, user: string): Promise<string> {
  const res = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return res.choices[0]?.message?.content || "";
}

export async function runIngest(
  documentContent: string,
  existingPages: WikiPage[],
  config: SchemaConfig
): Promise<{ action: string; slug: string; title: string; category: string; content: string }[]> {
  const system = buildSystemPrompt(config, "ingest");
  const context = existingPages.length > 0
    ? `\n\n기존 위키 페이지 목록:\n${existingPages.map((p) => `- ${p.title} (${p.slug})`).join("\n")}`
    : "\n\n기존 위키 페이지가 없습니다.";

  const text = await complete(system, `원본 문서:\n${documentContent}${context}`);
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("LLM 응답에서 JSON을 파싱할 수 없습니다.");
  return JSON.parse(jsonMatch[0]);
}

export async function runQuery(
  question: string,
  relevantPages: WikiPage[],
  config: SchemaConfig
): Promise<string> {
  const system = buildSystemPrompt(config, "query");
  const context = formatWikiContext(relevantPages);
  return complete(system, `위키 페이지:\n${context}\n\n질문: ${question}`);
}

export async function runLint(
  pages: WikiPage[],
  config: SchemaConfig
): Promise<{ page_slug: string; issue_type: string; description: string; suggestion: string }[]> {
  const system = buildSystemPrompt(config, "lint");
  const truncated = pages.map((p) => ({
    ...p,
    content: p.content.length > 300 ? p.content.slice(0, 300) + "...(생략)" : p.content,
  }));
  const context = formatWikiContext(truncated as WikiPage[]);
  const text = await complete(system, `검토 대상 위키 페이지:\n${context}`);
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    const items: { page_slug: string; issue_type: string; description: string; suggestion: string }[] = [];
    const objectRegex = /\{[^{}]*\}/g;
    const matches = jsonMatch[0].match(objectRegex) || [];
    for (const m of matches) {
      try {
        const obj = JSON.parse(m);
        if (obj.page_slug && obj.issue_type) items.push(obj);
      } catch {}
    }
    return items;
  }
}

export async function runChat(
  messages: { role: "user" | "assistant"; content: string }[],
  relevantPages: WikiPage[],
  config: SchemaConfig
): Promise<string> {
  const system = buildSystemPrompt(config, "chat");
  const context = relevantPages.length > 0
    ? `참고할 위키 페이지:\n${formatWikiContext(relevantPages)}`
    : "참고할 위키 페이지: (검색 결과 없음 — 반드시 '위키에 해당 정보가 없습니다.'라고만 답하세요)";
  const systemWithContext = `${system}\n\n${context}`;

  const res = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemWithContext },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  });
  return res.choices[0]?.message?.content || "";
}
