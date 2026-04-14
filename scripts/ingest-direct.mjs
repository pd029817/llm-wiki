#!/usr/bin/env node
/**
 * 독립 Ingest 스크립트 — Next.js 서버 없이 직접 Gemini API + Supabase REST를 호출.
 * 재시도 로직(최대 3회, exponential backoff) 및 rate-limit 대기 포함.
 */

const GEMINI_API_KEY = "AIzaSyD8VoAR2H9iDRiPFaJNNNyhaf-_7b10sEk";
const GEMINI_MODEL = "gemini-2.0-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const SUPABASE_URL = "https://dakxfsvrsufoqkrmcnxw.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRha3hmc3Zyc3Vmb3Frcm1jbnh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNjQwNTIsImV4cCI6MjA5MTc0MDA1Mn0.2CftRhbNWK_UGQDXRS6jkL_G56RFYRLFamG9HkNPbAg";

const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

// ─── Supabase helpers ───────────────────────────────────────

async function supaGet(table, query = "") {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`supaGet ${table}: ${res.status}`);
  return res.json();
}

async function supaInsert(table, row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...HEADERS, Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`supaInsert ${table}: ${res.status} ${await res.text()}`);
  return (await res.json())[0];
}

async function supaUpdate(table, match, row) {
  const query = Object.entries(match).map(([k, v]) => `${k}=eq.${v}`).join("&");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: { ...HEADERS, Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`supaUpdate ${table}: ${res.status} ${await res.text()}`);
  return (await res.json())[0];
}

// ─── Gemini helper (재시도 포함) ─────────────────────────────

async function callGemini(systemInstruction, userText, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: userText }] }],
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    }

    if (res.status === 429) {
      const retryAfter = Math.pow(2, attempt + 1) * 5; // 10s, 20s, 40s
      console.warn(`  ⏳ Rate limited. Retry ${attempt + 1}/${maxRetries} in ${retryAfter}s...`);
      await sleep(retryAfter * 1000);
      continue;
    }

    const err = await res.text();
    throw new Error(`Gemini ${res.status}: ${err}`);
  }
  throw new Error("Max retries exceeded for Gemini API");
}

// ─── Ingest 프롬프트 ────────────────────────────────────────

function buildIngestPrompt(config) {
  const baseRules = `위키 규칙:\n- 카테고리: ${config.categories.join(", ")}\n- 페이지 템플릿:\n${config.rules.page_template}`;
  const terminology = Object.entries(config.rules.terminology)
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join("\n");
  const termSection = terminology ? `\n- 용어 통일:\n${terminology}` : "";

  return `당신은 위키 관리자입니다. 다음 원본 문서를 읽고, 기존 위키 페이지 목록을 참고하여, 신규 페이지 생성 또는 기존 페이지 업데이트를 마크다운으로 출력하세요. 관련 페이지 간 크로스레퍼런스를 [[페이지슬러그]] 형식으로 반드시 포함하세요.

응답은 반드시 다음 JSON 형식으로:
[{"action": "create"|"update", "slug": "페이지-슬러그", "title": "페이지 제목", "category": "카테고리", "content": "마크다운 내용"}]

${baseRules}${termSection}`;
}

// ─── 유틸 ────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\uAC00-\uD7A3\u3131-\u3163]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ─── 메인 ────────────────────────────────────────────────────

async function main() {
  console.log("=== LLM-Wiki Direct Ingest ===\n");

  // 1. schema_config 가져오기
  const configs = await supaGet("schema_config", "limit=1");
  const config = configs[0];
  console.log(`Schema config loaded (categories: ${config.categories.join(", ")})\n`);

  // 2. raw_sources 전체 가져오기
  const sources = await supaGet("raw_sources", "order=created_at.asc");
  console.log(`Raw sources: ${sources.length}개\n`);

  const systemPrompt = buildIngestPrompt(config);
  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    console.log(`[${i + 1}/${sources.length}] "${source.title}"`);

    if (!source.content || source.content.trim().length < 50) {
      console.log("  SKIP: 내용이 너무 짧음\n");
      skipCount++;
      continue;
    }

    // 현재 위키 페이지 목록 조회 (매번 최신 상태 반영)
    const existingPages = await supaGet("wiki_pages", "select=id,title,slug,version,source_ids");
    const pageListText = existingPages.length > 0
      ? `\n\n기존 위키 페이지 목록:\n${existingPages.map((p) => `- ${p.title} (${p.slug})`).join("\n")}`
      : "\n\n기존 위키 페이지가 없습니다.";

    try {
      // Gemini 호출
      const text = await callGemini(
        systemPrompt,
        `원본 문서:\n${source.content}${pageListText}`
      );

      // JSON 파싱
      const jsonMatch = text.match(/\[[\s\S]*?\]/);
      if (!jsonMatch) {
        console.log("  WARN: JSON 파싱 실패, 건너뜀\n");
        failCount++;
        continue;
      }

      let results;
      try {
        results = JSON.parse(jsonMatch[0]);
      } catch {
        console.log("  WARN: JSON parse error, 건너뜀\n");
        failCount++;
        continue;
      }

      // DB에 반영
      for (const r of results) {
        const slug = r.slug || slugify(r.title);
        if (r.action === "create") {
          const existing = existingPages.find((p) => p.slug === slug);
          if (existing) {
            // 이미 존재하면 update로 전환
            const updatedSourceIds = [...new Set([...(existing.source_ids || []), source.id])];
            await supaUpdate("wiki_pages", { slug }, {
              content: r.content,
              category: r.category,
              source_ids: updatedSourceIds,
              version: existing.version + 1,
              updated_at: new Date().toISOString(),
            });
            await supaInsert("change_log", {
              page_id: existing.id,
              action: "updated",
              summary: `Ingest: "${source.title}"에서 업데이트`,
            });
            console.log(`  ✏️  updated: ${r.title} (${slug})`);
          } else {
            const newPage = await supaInsert("wiki_pages", {
              title: r.title,
              slug,
              content: r.content,
              category: r.category,
              source_ids: [source.id],
            });
            await supaInsert("change_log", {
              page_id: newPage.id,
              action: "created",
              summary: `Ingest: "${source.title}"에서 생성`,
            });
            console.log(`  ✅ created: ${r.title} (${slug})`);
          }
        } else if (r.action === "update") {
          const existing = existingPages.find((p) => p.slug === slug);
          if (existing) {
            const updatedSourceIds = [...new Set([...(existing.source_ids || []), source.id])];
            await supaUpdate("wiki_pages", { slug }, {
              content: r.content,
              category: r.category,
              source_ids: updatedSourceIds,
              version: existing.version + 1,
              updated_at: new Date().toISOString(),
            });
            await supaInsert("change_log", {
              page_id: existing.id,
              action: "updated",
              summary: `Ingest: "${source.title}"에서 업데이트`,
            });
            console.log(`  ✏️  updated: ${r.title} (${slug})`);
          } else {
            console.log(`  WARN: slug "${slug}" 존재하지 않아 create로 전환`);
            const newPage = await supaInsert("wiki_pages", {
              title: r.title,
              slug,
              content: r.content,
              category: r.category,
              source_ids: [source.id],
            });
            await supaInsert("change_log", {
              page_id: newPage.id,
              action: "created",
              summary: `Ingest: "${source.title}"에서 생성`,
            });
            console.log(`  ✅ created: ${r.title} (${slug})`);
          }
        }
      }

      successCount++;
    } catch (err) {
      console.error(`  ❌ ERROR: ${err.message}`);
      failCount++;
    }

    // rate limit 방지: 요청 간 6초 대기
    if (i < sources.length - 1) {
      await sleep(6000);
    }
    console.log();
  }

  // 최종 결과
  const wikiCount = await supaGet("wiki_pages", "select=id&limit=1000");
  console.log("=== 완료 ===");
  console.log(`성공: ${successCount}, 실패: ${failCount}, 건너뜀: ${skipCount}`);
  console.log(`위키 페이지 총: ${wikiCount.length}개`);
}

main().catch(console.error);
