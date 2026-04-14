import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const pageId = searchParams.get("page_id");
  const limit = parseInt(searchParams.get("limit") || "50");

  let query = supabase
    .from("change_log")
    .select("*, wiki_pages(title, slug)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (pageId) {
    query = query.eq("page_id", pageId);
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
