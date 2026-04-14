-- 원본 문서 (수정 불가)
CREATE TABLE raw_sources (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  content     TEXT,
  file_url    TEXT,
  mime_type   TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 위키 페이지 (LLM이 관리)
CREATE TABLE wiki_pages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  content     TEXT NOT NULL,
  category    TEXT,
  source_ids  UUID[],
  linked_pages UUID[],
  version     INT DEFAULT 1,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Full-Text Search 인덱스
ALTER TABLE wiki_pages ADD COLUMN fts tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', title || ' ' || content)) STORED;
CREATE INDEX wiki_pages_fts_idx ON wiki_pages USING gin(fts);

-- 변경 이력
CREATE TABLE change_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id     UUID REFERENCES wiki_pages(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  summary     TEXT,
  diff        TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 위키 구조 설정
CREATE TABLE schema_config (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categories  JSONB DEFAULT '[]'::jsonb,
  rules       JSONB DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 챗봇 대화 세션
CREATE TABLE chat_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id),
  messages        JSONB DEFAULT '[]'::jsonb,
  referenced_pages UUID[],
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 기본 schema_config 삽입
INSERT INTO schema_config (categories, rules) VALUES (
  '["기술문서", "업무프로세스", "프로젝트", "일반"]'::jsonb,
  '{"page_template": "## 개요\n\n## 상세 내용\n\n## 관련 페이지\n", "terminology": {}}'::jsonb
);

-- RLS 정책
ALTER TABLE raw_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE wiki_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

-- 인증된 사용자 전체 접근 허용 (조직 내부 도구)
CREATE POLICY "authenticated_access" ON raw_sources FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_access" ON wiki_pages FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_access" ON change_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_access" ON schema_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_access" ON chat_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);
