import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

type Row = Record<string, any>;

function makeSupabase(pages: Row[]) {
  return {
    from(_t: string) {
      const b: any = {
        _col: null as string | null,
        _val: null as any,
        select(_cols?: string) {
          return b;
        },
        eq(col: string, val: any) {
          b._col = col;
          b._val = val;
          return b;
        },
        maybeSingle() {
          const row = pages.find((p) => p[b._col!] === b._val);
          return Promise.resolve({ data: row ?? null, error: null });
        },
        then(resolve: any) {
          return Promise.resolve({ data: pages, error: null }).then(resolve);
        },
      };
      return b;
    },
  };
}

const supabaseRef: { current: ReturnType<typeof makeSupabase> | null } = { current: null };

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => supabaseRef.current,
}));

beforeEach(() => {
  supabaseRef.current = null;
  vi.resetModules();
});

afterEach(() => {
  supabaseRef.current = null;
});

function postRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/lint/fix", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/lint/fix slug normalization", () => {
  it("matches an NFD-stored slug when request uses NFC", async () => {
    const nfdSlug = "nda-미래테크-20260220".normalize("NFD");
    const nfcSlug = nfdSlug.normalize("NFC");
    expect(nfdSlug).not.toBe(nfcSlug);

    supabaseRef.current = makeSupabase([
      { slug: nfdSlug, title: "NDA", category: "계약", content: "# NDA\n\n본문." },
    ]);

    const { POST } = await import("./route");
    const res = await POST(
      postRequest({
        page_slug: nfcSlug,
        issue_type: "orphan",
        description: "d",
        suggestion: "거래처 목록을 만들어 [거래처 목록](/wiki/거래처-목록)을 참조하세요.",
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.slug).toBe(nfdSlug);
    expect(json.proposed_content).toContain("[거래처 목록](/wiki/거래처-목록)");
  });

  it("returns 404 when no normalization variant matches", async () => {
    supabaseRef.current = makeSupabase([
      { slug: "other-page", title: "x", category: null, content: "" },
    ]);

    const { POST } = await import("./route");
    const res = await POST(
      postRequest({
        page_slug: "missing-slug",
        issue_type: "stale",
        description: "d",
        suggestion: "s",
      })
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("페이지를 찾을 수 없습니다.");
  });
});

describe("POST /api/lint/fix rule-based fixes", () => {
  it("adds missing_link to a new 관련 문서 section", async () => {
    supabaseRef.current = makeSupabase([
      { slug: "스위치-서비스", title: "스위치 서비스", category: "서비스", content: "# 스위치 서비스\n\n본문 내용." },
    ]);

    const { POST } = await import("./route");
    const res = await POST(
      postRequest({
        page_slug: "스위치-서비스",
        issue_type: "missing_link",
        description: "약관 링크 없음",
        suggestion: "본문 하단 '관련 항목'에 [스위치 서비스 이용약관](/wiki/스위치-서비스-이용약관) 링크를 추가하세요.",
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.proposed_content).toContain("## 관련 문서");
    expect(json.proposed_content).toContain("- [스위치 서비스 이용약관](/wiki/스위치-서비스-이용약관)");
  });

  it("appends to an existing 관련 문서 section without duplicating", async () => {
    const existing = "# T 올케어플러스6\n\n본문.\n\n## 관련 문서\n- [기존 링크](/wiki/기존-링크)\n";
    supabaseRef.current = makeSupabase([
      { slug: "t-올케어플러스6", title: "T", category: "상품", content: existing },
    ]);

    const { POST } = await import("./route");
    const res = await POST(
      postRequest({
        page_slug: "t-올케어플러스6",
        issue_type: "missing_link",
        description: "d",
        suggestion: "[T 올케어플러스6 (스위치형)](/wiki/t-올케어플러스6-스위치)를 추가하세요.",
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.proposed_content).toContain("- [기존 링크](/wiki/기존-링크)");
    expect(json.proposed_content).toContain("- [T 올케어플러스6 (스위치형)](/wiki/t-올케어플러스6-스위치)");
  });

  it("returns 422 when missing_link suggestion has no link", async () => {
    supabaseRef.current = makeSupabase([
      { slug: "p", title: "t", category: null, content: "c" },
    ]);

    const { POST } = await import("./route");
    const res = await POST(
      postRequest({
        page_slug: "p",
        issue_type: "missing_link",
        description: "d",
        suggestion: "그냥 설명문만 있음",
      })
    );
    expect(res.status).toBe(422);
  });

  it("updates 상태 and 최종 업데이트 for stale issues", async () => {
    const content = "# 계약서\n\n상태: 초안 — 법무팀 검토 전\n\n최종 업데이트: 2025-10-01\n";
    supabaseRef.current = makeSupabase([
      { slug: "계약서-사무용품-초안", title: "계약서", category: "계약", content },
    ]);

    const { POST } = await import("./route");
    const res = await POST(
      postRequest({
        page_slug: "계약서-사무용품-초안",
        issue_type: "stale",
        description: "유효기간 시작일 지남",
        suggestion: "법무 검토 결과를 확인해 '상태' 메타데이터를 '발효'로 갱신하세요.",
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.proposed_content).toContain("상태: 발효");
    expect(json.proposed_content).not.toContain("최종 업데이트: 2025-10-01");
    expect(json.proposed_content).toMatch(/최종 업데이트:\s*\d{4}-\d{2}-\d{2}/);
    expect(json.proposed_content).toContain("Lint 자동 갱신");
  });

  it("returns 422 for contradiction issues (not rule-fixable)", async () => {
    supabaseRef.current = makeSupabase([
      { slug: "p", title: "t", category: null, content: "c" },
    ]);

    const { POST } = await import("./route");
    const res = await POST(
      postRequest({
        page_slug: "p",
        issue_type: "contradiction",
        description: "d",
        suggestion: "s",
      })
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toContain("contradiction");
  });

  it("returns 422 when the link already exists in the page", async () => {
    const content = "# 본문\n\n이미 [링크](/wiki/대상)가 있습니다.\n";
    supabaseRef.current = makeSupabase([
      { slug: "p", title: "t", category: null, content },
    ]);

    const { POST } = await import("./route");
    const res = await POST(
      postRequest({
        page_slug: "p",
        issue_type: "missing_link",
        description: "d",
        suggestion: "[링크](/wiki/대상)를 추가하세요.",
      })
    );
    expect(res.status).toBe(422);
  });
});
