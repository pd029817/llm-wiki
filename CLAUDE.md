@AGENTS.md
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# LLM-Wiki 지식관리 시스템

Next.js 16(App Router) + React 19 + Supabase + Vitest 기반의 사내 지식관리 웹앱. 원본 문서를 업로드하면 마크다운으로 변환·정규화해 위키 페이지로 생성·질의하고, 세션 내부 lint/fix 워크플로로 품질을 관리한다.

## 개발 명령

```bash
npm run dev         # Next.js 개발 서버 (http://localhost:3000)
npm run build       # 프로덕션 빌드
npm run start       # 빌드 결과 실행
npm run lint        # ESLint (eslint-config-next)
npm run test        # Vitest 1회 실행
npm run test:watch  # Vitest watch
npx vitest run path/to/file.test.ts           # 단일 테스트 파일
npx vitest run -t "테스트 이름 패턴"            # 이름으로 필터
```

테스트 환경은 jsdom + `@testing-library/react`. `@/…` alias가 `src/`에 매핑됨 ([vitest.config.ts](vitest.config.ts)).

## 폴더 구조 (데이터 파이프라인)

- [sources/](sources/) — 원본 문서 (웹페이지 저장, Word, PDF 등). **삭제/수정 금지**
- [raw_sources/](raw_sources/) — 마크다운으로 변환된 원본. 원본 출처 URL/파일명을 메타데이터로 필수 기록
- [wiki/](wiki/) — LLM이 생성/편집한 위키 페이지. "최종 업데이트 날짜" 표기 필수
- [src/](src/) — Next.js 앱 코드
- [scripts/](scripts/) — 일회성 ingest/seed 스크립트 (`.mjs`)
- [skills/](skills/) — 본 세션에서 호출 가능한 프로젝트 전용 Claude Code skill
- [supabase/migrations/](supabase/migrations/) — DB 스키마 마이그레이션

## 아키텍처 개요

### 저장소 레이어
- Supabase Postgres가 정식 저장소. 주요 테이블: `raw_sources`, `wiki_pages`, `change_logs`, `schema_config`, `chat_sessions` ([src/lib/types.ts](src/lib/types.ts), [supabase/migrations/001_initial_schema.sql](supabase/migrations/001_initial_schema.sql))
- [src/lib/supabase/](src/lib/supabase/) — SSR/브라우저 클라이언트 팩토리 (`@supabase/ssr`)
- [src/lib/storage.ts](src/lib/storage.ts) — 디스크(`raw_sources/`, `wiki/`)로 동일 내용을 미러링하는 유틸. API 라우트가 DB write 후 파일로도 기록해 Claude Code skill이 직접 읽을 수 있게 한다

### API 라우트 ([src/app/api/](src/app/api/))
- `ingest` — 파일 업로드 → (PDF는 `pdfjs-dist` + `tesseract.js` OCR, DOCX는 `mammoth`, `.txt`는 휴리스틱 마크다운화) → `raw_sources` 레코드 + `raw_sources/*.md` 생성
- `wiki` — 위키 페이지 CRUD
- `query` / `chat` — LLM에 페이지 컨텍스트를 실어 질의
- `lint` — **LLM 호출 안 함**. 프로젝트 루트의 `lint-report.json`을 읽어 돌려줌. 리포트는 [skills/wiki-content-lint/SKILL.md](skills/wiki-content-lint/SKILL.md) 스킬을 Claude Code 세션에서 실행해 생성
- `lint/fix` — 리포트의 제안을 적용해 위키 페이지를 수정
- `sources` / `changelog` / `settings` — 목록/변경이력/스키마 설정
- LLM 래퍼는 [src/lib/llm.ts](src/lib/llm.ts) (Groq/Google Generative AI)

### UI ([src/app/](src/app/))
App Router 페이지: `/`(대시보드), `/ingest`, `/sources`, `/wiki`, `/query`, `/chat`, `/lint`, `/settings`. 모든 페이지는 한국어.

### Lint 워크플로의 이중 구조
웹앱 `/lint` 페이지가 보여주는 리포트는 Next.js 런타임이 아니라 Claude Code 세션이 만든다. 사용자가 "lint 실행", "/wiki-lint" 등을 요청하면 `wiki-content-lint` skill을 호출해 `lint-report.json`을 루트에 쓰고, 그 파일을 `/api/lint`가 읽어 UI에 노출한다. 이 경계가 깨지면 UI가 stale해지므로 lint 관련 코드를 수정할 때 주의.

## 작업 규칙

- 한국어로 작성
- 원본 문서 보존 (sources/ 폴더 삭제·수정 금지)
- 마크다운 변환 시 원본 출처 URL/파일명 메타데이터 필수
- 위키 페이지에 "최종 업데이트 날짜" 표시
- 개인정보 포함 문서는 마스킹 처리 후 등록
