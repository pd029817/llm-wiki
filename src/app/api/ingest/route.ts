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

function formatLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return "";

  // 제 N 편/장/절/조 → 헤딩
  if (/^제\s*\d+\s*편(?:\s|[(])/.test(trimmed) && trimmed.length < 120) return `## ${trimmed}`;
  if (/^제\s*\d+\s*장(?:\s|[(]|$)/.test(trimmed) && trimmed.length < 120) return `## ${trimmed}`;
  if (/^제\s*\d+\s*절(?:\s|[(]|$)/.test(trimmed) && trimmed.length < 120) return `### ${trimmed}`;
  if (/^제\s*\d+\s*조(?:\s|[(]|$)/.test(trimmed) && trimmed.length < 200) return `### ${trimmed}`;

  // Chapter / Section
  if (/^(chapter|section|part)\s+\d+/i.test(trimmed) && trimmed.length < 120) return `## ${trimmed}`;

  // 1. / 1.1 / 1.1.1 로 시작하는 섹션형 짧은 제목
  const numMatch = trimmed.match(/^(\d+(?:\.\d+){0,3})\.?\s+(.+)$/);
  if (numMatch && trimmed.length < 120 && !/[.!?]$/.test(trimmed)) {
    const depth = Math.min(numMatch[1].split(".").length + 1, 6);
    return `${"#".repeat(depth)} ${trimmed}`;
  }

  // 불릿 목록 정규화
  const bullet = trimmed.match(/^[·•●■◆▪▫◦\-–—*]\s*(.+)$/);
  if (bullet) return `- ${bullet[1]}`;

  // (1), 1), ①② 같은 번호 항목
  const ordered = trimmed.match(/^(?:\(\s*(\d+)\s*\)|(\d+)\))\s*(.+)$/);
  if (ordered) return `- ${trimmed}`;

  return trimmed;
}

function tryParseJson(input: string): unknown | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  const looksLikeJson =
    (first === "{" && last === "}") || (first === "[" && last === "]");
  if (!looksLikeJson) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function isPrimitive(v: unknown): v is string | number | boolean | null {
  return (
    v === null ||
    typeof v === "string" ||
    typeof v === "number" ||
    typeof v === "boolean"
  );
}

function formatPrimitive(v: string | number | boolean | null): string {
  if (v === null) return "_null_";
  if (typeof v === "string") return v.trim() === "" ? '""' : v;
  return String(v);
}

function isFlatObjectArray(arr: unknown[]): arr is Record<string, unknown>[] {
  if (arr.length === 0) return false;
  return arr.every(
    (el) =>
      el !== null &&
      typeof el === "object" &&
      !Array.isArray(el) &&
      Object.values(el as Record<string, unknown>).every(isPrimitive),
  );
}

function renderJsonTable(rows: Record<string, unknown>[]): string {
  const keys: string[] = [];
  for (const row of rows) {
    for (const k of Object.keys(row)) if (!keys.includes(k)) keys.push(k);
  }
  const header = `| ${keys.join(" | ")} |`;
  const sep = `| ${keys.map(() => "---").join(" | ")} |`;
  const body = rows
    .map(
      (row) =>
        `| ${keys
          .map((k) => {
            const v = row[k];
            if (v === undefined) return "";
            if (!isPrimitive(v)) return "`" + JSON.stringify(v) + "`";
            return formatPrimitive(v).replace(/\|/g, "\\|").replace(/\n/g, " ");
          })
          .join(" | ")} |`,
    )
    .join("\n");
  return [header, sep, body].join("\n");
}

function renderJson(value: unknown, depth = 0): string {
  const indent = "  ".repeat(depth);
  if (isPrimitive(value)) return `${indent}${formatPrimitive(value)}`;

  if (Array.isArray(value)) {
    if (value.length === 0) return `${indent}_(빈 배열)_`;
    if (value.every(isPrimitive)) {
      return value.map((v) => `${indent}- ${formatPrimitive(v as any)}`).join("\n");
    }
    if (depth === 0 && isFlatObjectArray(value)) {
      return renderJsonTable(value);
    }
    return value
      .map((v, i) => {
        if (isPrimitive(v)) return `${indent}- ${formatPrimitive(v)}`;
        return `${indent}- **[${i}]**\n${renderJson(v, depth + 1)}`;
      })
      .join("\n");
  }

  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return `${indent}_(빈 객체)_`;
    return entries
      .map(([k, v]) => {
        if (isPrimitive(v)) return `${indent}- **${k}**: ${formatPrimitive(v)}`;
        if (Array.isArray(v) && v.every(isPrimitive)) {
          if (v.length === 0) return `${indent}- **${k}**: _(빈 배열)_`;
          return `${indent}- **${k}**:\n${v
            .map((x) => `${indent}  - ${formatPrimitive(x as any)}`)
            .join("\n")}`;
        }
        return `${indent}- **${k}**:\n${renderJson(v, depth + 1)}`;
      })
      .join("\n");
  }

  return `${indent}${String(value)}`;
}

function jsonToMarkdown(title: string, parsed: unknown, original: string): string {
  const rendered = renderJson(parsed);
  const raw = JSON.stringify(parsed, null, 2);
  return (
    `# ${title}\n\n` +
    `${rendered}\n\n` +
    `<details>\n<summary>원본 JSON</summary>\n\n` +
    "```json\n" +
    `${raw}\n` +
    "```\n\n</details>\n"
  );
}

function toMarkdown(title: string, content: string): string {
  const parsed = tryParseJson(content);
  if (parsed !== undefined && typeof parsed === "object" && parsed !== null) {
    return jsonToMarkdown(title, parsed, content);
  }

  const normalized = content
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const blocks: string[] = [];
  for (const p of paragraphs) {
    const lines = p.split("\n").map((l) => l.trim()).filter(Boolean);

    // 단락 내부의 모든 줄이 리스트/헤딩 형태라면 줄 단위로 보존
    const formatted = lines.map(formatLine);
    const allStructural = formatted.every(
      (l) => l.startsWith("- ") || /^#{1,6}\s/.test(l),
    );

    if (allStructural) {
      blocks.push(formatted.join("\n"));
      continue;
    }

    // 첫 줄이 헤딩이면 분리
    const first = formatLine(lines[0]);
    if (/^#{1,6}\s/.test(first)) {
      const rest = lines.slice(1).join(" ").trim();
      blocks.push(rest ? `${first}\n\n${rest}` : first);
      continue;
    }

    // 일반 문단: 줄바꿈을 공백으로 합쳐 문장 흐름을 살림
    blocks.push(lines.join(" "));
  }

  const body = blocks.join("\n\n");
  return `# ${title}\n\n${body}\n`;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { source_id, category } = body;
    const normalizedCategory =
      typeof category === "string" && category.trim() ? category.trim() : null;

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
      const updatePayload: Record<string, unknown> = {
        content: markdown,
        source_ids: updatedSourceIds,
        version: (existing.version || 0) + 1,
        updated_at: new Date().toISOString(),
      };
      if (normalizedCategory) updatePayload.category = normalizedCategory;
      const { data: updated, error: updateError } = await supabase
        .from("wiki_pages")
        .update(updatePayload)
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
          category: normalizedCategory,
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
