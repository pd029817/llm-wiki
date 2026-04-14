import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runChat } from "@/lib/llm";
import { SchemaConfig, WikiPage, ChatMessage } from "@/lib/types";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { messages, session_id } = await request.json() as {
    messages: ChatMessage[];
    session_id?: string;
  };

  const lastMessage = messages[messages.length - 1];

  const searchTerms = lastMessage.content.split(/\s+/).filter(Boolean).join(" | ");
  let { data: pages } = await supabase
    .from("wiki_pages")
    .select("*")
    .textSearch("fts", searchTerms, { type: "plain" })
    .limit(5);

  if (!pages || pages.length === 0) {
    const keyword = lastMessage.content.split(/\s+/).filter(Boolean)[0] || "";
    const { data: fallback } = await supabase
      .from("wiki_pages")
      .select("*")
      .or(`title.ilike.%${keyword}%,content.ilike.%${keyword}%`)
      .limit(5);
    pages = fallback;
  }

  const { data: config } = await supabase
    .from("schema_config")
    .select("*")
    .limit(1)
    .single();

  const answer = await runChat(
    messages.map((m) => ({ role: m.role, content: m.content })),
    (pages || []) as WikiPage[],
    config as SchemaConfig
  );

  const updatedMessages = [...messages, { role: "assistant" as const, content: answer }];
  const referencedPages = (pages || []).map((p: WikiPage) => p.id);

  let newSessionId = session_id;
  if (session_id) {
    await supabase
      .from("chat_sessions")
      .update({ messages: updatedMessages, referenced_pages: referencedPages })
      .eq("id", session_id);
  } else {
    const { data: session } = await supabase
      .from("chat_sessions")
      .insert({ messages: updatedMessages, referenced_pages: referencedPages })
      .select("id")
      .single();
    newSessionId = session?.id;
  }

  return NextResponse.json({
    answer,
    session_id: newSessionId,
    sources: (pages || []).map((p: WikiPage) => ({ title: p.title, slug: p.slug })),
  });
}

export const maxDuration = 30;
