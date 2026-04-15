import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runQuery } from "@/lib/llm";
import { SchemaConfig, WikiPage } from "@/lib/types";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { question } = await request.json();

  const searchTerms = question.split(/\s+/).join(" & ");
  const { data: pages } = await supabase
    .from("wiki_pages")
    .select("*")
    .textSearch("fts", searchTerms, { type: "plain" })
    .limit(10);

  let relevantPages = pages || [];
  if (relevantPages.length === 0) {
    const { data: recent } = await supabase
      .from("wiki_pages")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(5);
    relevantPages = recent || [];
  }

  const { data: config } = await supabase
    .from("schema_config")
    .select("*")
    .limit(1)
    .single();

  const answer = await runQuery(
    question,
    relevantPages as WikiPage[],
    config as SchemaConfig
  );

  await supabase.from("chat_sessions").insert({
    session_type: "query",
    messages: [
      { role: "user", content: question },
      { role: "assistant", content: answer },
    ],
    referenced_pages: relevantPages.map((p: WikiPage) => p.id),
  });

  return NextResponse.json({
    answer,
    sources: relevantPages.map((p: WikiPage) => ({ title: p.title, slug: p.slug })),
  });
}

export const maxDuration = 30;
