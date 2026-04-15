import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface LintIssue {
  page_slug: string;
  issue_type: string;
  description: string;
  suggestion: string;
}

interface LintReport {
  generated_at?: string;
  total_pages?: number;
  issues?: LintIssue[];
}

export async function POST() {
  const supabase = await createClient();
  const { data: pages } = await supabase.from("wiki_pages").select("slug");
  const totalPages = pages?.length ?? 0;

  if (totalPages === 0) {
    return NextResponse.json({ issues: [], message: "위키 페이지가 없습니다." });
  }

  const reportPath = path.join(process.cwd(), "lint-report.json");
  let report: LintReport | null = null;
  try {
    const raw = await fs.readFile(reportPath, "utf8");
    report = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      {
        issues: [],
        total_pages: totalPages,
        error:
          "lint-report.json이 없습니다. Claude Code에서 `wiki-content-lint` skill을 실행해 리포트를 먼저 생성하세요.",
      },
      { status: 200 }
    );
  }

  const issues = Array.isArray(report?.issues) ? report!.issues! : [];
  return NextResponse.json({
    issues,
    total_pages: report?.total_pages ?? totalPages,
    generated_at: report?.generated_at ?? null,
  });
}

export const maxDuration = 60;
