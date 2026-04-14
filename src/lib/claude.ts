import Anthropic from "@anthropic-ai/sdk";
import { SchemaConfig, WikiPage } from "./types";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

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
    chat: `당신은 회사 지식 관리 위키 기반 어시스턴트입니다. 제공된 위키 페이지를 기반으로 질문에 답하세요. 출처를 인용하고, 위키에 없는 내용은 명확히 밝히세요.`,
  };

  return `${prompts[operation]}\n\n${baseRules}${termSection}`;
}

function formatWikiContext(pages: WikiPage[]): string {
  return pages
    .map((p) => `--- 위키 페이지: ${p.title} (slug: ${p.slug}, 카테고리: ${p.category}) ---\n${p.content}`)
    .join("\n\n");
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

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: `원본 문서:\n${documentContent}${context}` }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
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

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system,
    messages: [{ role: "user", content: `위키 페이지:\n${context}\n\n질문: ${question}` }],
  });

  return response.content[0].type === "text" ? response.content[0].text : "";
}

export async function runLint(
  pages: WikiPage[],
  config: SchemaConfig
): Promise<{ page_slug: string; issue_type: string; description: string; suggestion: string }[]> {
  const system = buildSystemPrompt(config, "lint");
  const context = formatWikiContext(pages);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: `검토 대상 위키 페이지:\n${context}` }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  return JSON.parse(jsonMatch[0]);
}

export async function runChat(
  messages: { role: "user" | "assistant"; content: string }[],
  relevantPages: WikiPage[],
  config: SchemaConfig
): Promise<string> {
  const system = buildSystemPrompt(config, "chat");
  const context = relevantPages.length > 0
    ? `참고할 위키 페이지:\n${formatWikiContext(relevantPages)}`
    : "";

  const systemWithContext = context ? `${system}\n\n${context}` : system;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: systemWithContext,
    messages,
  });

  return response.content[0].type === "text" ? response.content[0].text : "";
}
