#!/usr/bin/env node
/**
 * 모든 raw_sources를 순차적으로 Ingest API에 전송하여 위키 페이지를 생성한다.
 * Gemini 무료 티어 제한(분당 15회)을 고려해 요청 간 5초 대기.
 */

const BASE_URL = "http://localhost:3000";

async function fetchSourceIds() {
  const res = await fetch(`${BASE_URL}/api/sources`);
  if (!res.ok) throw new Error(`Failed to fetch sources: ${res.status}`);
  const data = await res.json();
  return data.sources || data;
}

async function ingest(sourceId, title, index, total) {
  console.log(`[${index + 1}/${total}] Ingesting: ${title} (${sourceId})`);
  const res = await fetch(`${BASE_URL}/api/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source_id: sourceId }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`  ERROR ${res.status}: ${err}`);
    return { success: false, sourceId, title };
  }

  const data = await res.json();
  const actions = (data.results || []).map(
    (r) => `${r.action} "${r.page?.title || "?"}"`
  );
  console.log(`  OK: ${actions.length > 0 ? actions.join(", ") : "no changes"}`);
  return { success: true, sourceId, title, results: data.results };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const sources = await fetchSourceIds();
  console.log(`Total sources: ${sources.length}\n`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    const result = await ingest(s.id, s.title, i, sources.length);
    if (result.success) successCount++;
    else failCount++;

    // Gemini 무료 티어 rate limit 방지: 5초 대기
    if (i < sources.length - 1) {
      await sleep(5000);
    }
  }

  console.log(`\nDone! Success: ${successCount}, Failed: ${failCount}`);
}

main().catch(console.error);
