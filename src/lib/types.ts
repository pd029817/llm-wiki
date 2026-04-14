export interface RawSource {
  id: string;
  title: string;
  content: string | null;
  file_url: string | null;
  mime_type: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface WikiPage {
  id: string;
  title: string;
  slug: string;
  content: string;
  category: string | null;
  source_ids: string[] | null;
  linked_pages: string[] | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ChangeLog {
  id: string;
  page_id: string;
  action: string;
  summary: string | null;
  diff: string | null;
  created_at: string;
}

export interface SchemaConfig {
  id: string;
  categories: string[];
  rules: {
    page_template: string;
    terminology: Record<string, string>;
  };
  updated_at: string;
}

export interface ChatSession {
  id: string;
  user_id: string | null;
  messages: ChatMessage[];
  referenced_pages: string[] | null;
  created_at: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
}
