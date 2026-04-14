# LLM-Wiki: 회사 지식 관리 시스템 설계

## 개요

Karpathy의 LLM-wiki 패턴을 기반으로 한 회사 종합 지식 관리 웹 앱.
기존 RAG 시스템의 한계(중복 검색, 문맥 단절, 정보 비동기화)를 보완하여
LLM이 지식을 축적/정제/유지보수하는 위키 시스템을 구축한다.

## 요구사항

- **사용자**: 부서/조직 단위 (다중 사용자)
- **지식 범위**: 기술 문서, 업무 프로세스, 프로젝트 히스토리 등 복합
- **RAG 관계**: 독립적으로 먼저 구축, 향후 RAG 연동 여부 결정
- **챗봇 연동**: 위키 지식을 챗봇이 활용할 수 있는 API 제공

## 아키텍처

### 3계층 구조

```
┌──────────────┐  ┌──────────────┐
│   Wiki UI    │  │   Chatbot    │
│  (Next.js)   │  │ (Slack/웹/등) │
└──────┬───────┘  └──────┬───────┘
       │                 │
┌──────▼─────────────────▼────────┐
│        API Layer (Next.js)       │
│  /api/ingest                     │
│  /api/query                      │
│  /api/lint                       │
│  /api/chat                       │
└──────────────┬──────────────────┘
               │
┌──────────────▼──────────────────┐
│       Supabase (데이터)          │
│  raw_sources · wiki_pages        │
│  change_log · schema_config      │
│  chat_sessions                   │
└─────────────────────────────────┘
```

### 기술 스택

| 레이어 | 기술 |
|--------|------|
| 프론트엔드 | Next.js (App Router) |
| 백엔드 API | Next.js API Routes |
| 데이터베이스 | Supabase (PostgreSQL) |
| 인증 | Supabase Auth |
| 파일 저장 | Supabase Storage |
| LLM | Claude API |
| 마크다운 렌더링 | react-markdown |
| 배포 | Vercel |

## 핵심 기능: 3대 오퍼레이션

### 1. Ingest (수집)

원본 문서를 위키 지식으로 변환하는 프로세스.

1. 사용자가 원본 문서(PDF, 텍스트, URL 등)를 업로드
2. Claude API가 문서를 읽고 핵심 내용을 추출
3. 관련 기존 위키 페이지를 탐색하여 업데이트 또는 신규 페이지 생성
4. 크로스레퍼런스 자동 삽입 (관련 페이지 간 링크)
5. change_log에 변경 내역 기록

### 2. Query (질의)

위키 지식을 기반으로 질문에 답변.

1. 사용자가 자연어로 질문
2. wiki_pages에서 관련 페이지 검색 (1차: Supabase Full-Text Search, 향후 pgvector 임베딩 확장 가능)
3. Claude API가 관련 위키 페이지를 컨텍스트로 받아 종합 답변 생성
4. 답변에 출처(위키 페이지) 인용
5. 유용한 답변은 새 위키 페이지로 환류 가능

### 3. Lint (점검)

위키 건강 상태를 점검하고 품질을 유지.

1. 주기적으로 또는 수동으로 실행
2. 탐지 항목:
   - 모순되는 내용
   - 오래된 정보
   - 고아 페이지 (링크 없는 페이지)
   - 누락된 크로스레퍼런스
3. 문제 목록을 리포트로 제시
4. 자동 수정 제안

## 데이터 모델

```sql
-- 원본 문서 (수정 불가)
raw_sources (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  content     TEXT,
  file_url    TEXT,
  mime_type   TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 위키 페이지 (LLM이 관리)
wiki_pages (
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

-- 변경 이력
change_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id     UUID REFERENCES wiki_pages(id),
  action      TEXT NOT NULL,
  summary     TEXT,
  diff        TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 위키 구조 설정
schema_config (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categories  JSONB,
  rules       JSONB,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 챗봇 대화 세션
chat_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id),
  messages        JSONB[],
  referenced_pages UUID[],
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

## 웹 UI 구성

| 페이지 | 경로 | 역할 |
|--------|------|------|
| 대시보드 | `/` | 최근 변경, 위키 통계, Lint 알림 |
| 위키 브라우저 | `/wiki` | 카테고리별 페이지 목록, 검색 |
| 페이지 상세 | `/wiki/[slug]` | 마크다운 렌더링, 크로스레퍼런스, 변경 이력, 원본 소스 참조 |
| 질의 | `/query` | 자연어 질문 → 위키 기반 답변 + 출처 |
| 소스 업로드 | `/ingest` | 파일/텍스트/URL 업로드 → LLM 처리 결과 미리보기 → 확정 |
| Lint 리포트 | `/lint` | 위키 건강 상태, 문제 목록, 자동 수정 제안 |
| 챗봇 | `/chat` | 대화형 위키 질의 인터페이스 |
| 설정 | `/settings` | 카테고리 관리, LLM 규칙(schema) 편집 |

## API 엔드포인트

| 엔드포인트 | 메서드 | 역할 |
|-----------|--------|------|
| `/api/ingest` | POST | 원본 문서 업로드 및 위키 페이지 생성/업데이트 |
| `/api/query` | POST | 자연어 질의 → 위키 기반 답변 |
| `/api/lint` | POST | 위키 점검 실행 |
| `/api/chat` | POST | 챗봇 대화 (스트리밍 응답) |
| `/api/wiki` | GET | 위키 페이지 목록/검색 |
| `/api/wiki/[slug]` | GET/PUT | 위키 페이지 조회/수동 편집 |
| `/api/sources` | GET/POST | 원본 문서 목록/업로드 |
| `/api/changelog` | GET | 변경 이력 조회 |

## 챗봇 연동

`/api/chat` 엔드포인트를 통해 어떤 클라이언트든 연결 가능:

- **웹 챗** (`/chat` 페이지): Next.js 내장
- **Slack Bot**: `/api/chat`에 Slack Events API 연결
- **Teams Bot**: 동일한 API 엔드포인트 활용

동작 방식:
1. 사용자 질문 수신
2. wiki_pages에서 관련 페이지 검색
3. 관련 위키 페이지를 컨텍스트로 Claude API에 전달
4. 스트리밍 답변 생성 + 출처 위키 페이지 인용
5. 대화 이력은 chat_sessions에 저장

## LLM 프롬프트 전략

모든 LLM 호출 시 schema_config의 rules를 시스템 프롬프트에 포함하여 일관된 위키 관리를 보장한다.

- **Ingest 프롬프트**: "당신은 위키 관리자입니다. 다음 원본 문서를 읽고, 기존 위키 페이지 목록을 참고하여, 신규 페이지 생성 또는 기존 페이지 업데이트를 마크다운으로 출력하세요. 관련 페이지 간 크로스레퍼런스를 반드시 포함하세요."
- **Query 프롬프트**: "다음 위키 페이지들을 참고하여 질문에 답하세요. 반드시 출처 페이지를 인용하세요."
- **Lint 프롬프트**: "다음 위키 페이지들을 검토하여 모순, 오래된 정보, 고아 페이지, 누락된 크로스레퍼런스를 찾아 리포트하세요."

schema_config.rules에서 카테고리별 작성 규칙, 용어 통일 기준, 페이지 구조 템플릿 등을 정의하며, 이 규칙이 모든 프롬프트에 주입된다.
