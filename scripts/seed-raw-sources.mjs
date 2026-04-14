#!/usr/bin/env node
/**
 * raw-sources/*.md 파일을 Supabase raw_sources 테이블에 일괄 삽입
 */
import fs from "fs";
import path from "path";

const SUPABASE_URL = "https://dakxfsvrsufoqkrmcnxw.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRha3hmc3Zyc3Vmb3Frcm1jbnh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNjQwNTIsImV4cCI6MjA5MTc0MDA1Mn0.2CftRhbNWK_UGQDXRS6jkL_G56RFYRLFamG9HkNPbAg";

const RAW_DIR = path.resolve(
  import.meta.dirname,
  "../raw-sources"
);

function extractTitle(content) {
  const match = content.match(/^#\s+(.+)/m);
  return match ? match[1].trim() : "Untitled";
}

function extractSourceUrl(content) {
  const match = content.match(/출처:\s*\[([^\]]*)\]\(([^)]+)\)/);
  return match ? match[2] : null;
}

async function main() {
  const files = fs
    .readdirSync(RAW_DIR)
    .filter((f) => f.endsWith(".md") && f !== "_index.md");

  console.log(`Found ${files.length} files to insert`);

  const rows = files.map((file) => {
    const content = fs.readFileSync(path.join(RAW_DIR, file), "utf-8");
    const title = extractTitle(content);
    const fileUrl = extractSourceUrl(content);
    return {
      title,
      content,
      file_url: fileUrl,
      mime_type: "text/markdown",
    };
  });

  // Supabase REST API로 일괄 삽입 (50개 미만이므로 한 번에)
  const res = await fetch(`${SUPABASE_URL}/rest/v1/raw_sources`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(rows),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`Error ${res.status}: ${err}`);
    process.exit(1);
  }

  const inserted = await res.json();
  console.log(`Successfully inserted ${inserted.length} documents`);
}

main();
