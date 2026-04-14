import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const category = searchParams.get("category");

  let query = supabase.from("wiki_pages").select("id, title, slug, category, version, created_at, updated_at");

  if (q) {
    query = query.textSearch("fts", q.split(" ").join(" & "), { type: "plain" });
  }

  if (category) {
    query = query.eq("category", category);
  }

  const { data, error } = await query.order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
