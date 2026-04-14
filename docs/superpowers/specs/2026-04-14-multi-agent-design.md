# LLM-Wiki 멀티 에이전트 체계 설계

## 개요

LLM-Wiki 프로젝트의 완성도를 높이기 위해 3계층 멀티 에이전트 체계를 구축한다.
빌드 타임(개발 프로세스), 하네스(품질/운영), 런타임(앱 내부) 에이전트가 각각 독립적으로 동작하며,
커스텀 스킬이 각 에이전트의 행동을 규정한다.

## 요구사항

- 기존 15개 Task 구현 계획을 멀티 에이전트로 실행
- Task 간 의존성을 자동으로 관리
- 병렬 가능한 작업은 동시 실행
- 각 에이전트 결과물의 품질을 하네스 에이전트가 검증
- 앱 내부 런타임 에이전트도 독립적으로 동작

## 계층 1: 빌드 타임 에이전트 (개발 프로세스)

프로젝트를 구현할 때 Claude Code 서브에이전트들이 역할을 나눠서 작업한다.

### 에이전트 목록

| 에이전트 | 역할 | 담당 Task | 입력 | 출력 |
|---------|------|----------|------|------|
| **Scaffolder** | Next.js 프로젝트 초기 셋업, 의존성 설치 | Task 1 | 없음 | `package.json`, `next.config.ts`, `.env.local` |
| **DB Architect** | Supabase 스키마, 마이그레이션, 타입 정의, 클라이언트 | Task 2 | Scaffolder 출력 | `supabase/migrations/`, `src/lib/supabase/`, `src/lib/types.ts` |
| **LLM Engineer** | Claude API 클라이언트, 프롬프트 빌더 | Task 3 | `src/lib/types.ts` | `src/lib/claude.ts` |
| **UI Builder** | 공통 컴포넌트, 레이아웃, 네비게이션 | Task 4 | Scaffolder 출력 | `src/components/`, `src/app/layout.tsx` |
| **API Developer** | 모든 API Route 구현 | Task 5, 6, 7 | DB Architect + LLM Engineer 출력 | `src/app/api/` |
| **Page Builder** | 모든 프론트엔드 페이지 | Task 8~14 | UI Builder + API Developer 출력 | `src/app/*/page.tsx` |
| **QA Inspector** | TypeScript 체크, 빌드, 통합 테스트 | Task 15 | 전체 코드 | 검증 리포트 |

### 의존성 그래프

```
Phase 1 (동시):
  Scaffolder ─────────────────────────────────

Phase 2 (동시, Scaffolder 완료 후):
  DB Architect ──────┐
  UI Builder ────────┤ (병렬)
                     │
Phase 3 (DB Architect 완료 후):
  LLM Engineer ──────┤

Phase 4 (DB Architect + LLM Engineer 완료 후):
  API Developer ─────┤

Phase 5 (UI Builder + API Developer 완료 후):
  Page Builder ──────┤
    ├── Dashboard (Task 8)     ┐
    ├── Wiki pages (Task 9)    │ (병렬 가능)
    ├── Ingest page (Task 10)  │
    ├── Query page (Task 11)   │
    ├── Chat page (Task 12)    │
    ├── Lint page (Task 13)    │
    └── Settings page (Task 14)┘

Phase 6 (전체 완료 후):
  QA Inspector ──────┘
```

### 의존성 매트릭스

| 에이전트 | 선행 에이전트 | 필요 파일 |
|---------|-------------|----------|
| Scaffolder | 없음 | — |
| DB Architect | Scaffolder | `package.json` 존재 확인 |
| UI Builder | Scaffolder | `package.json` 존재 확인 |
| LLM Engineer | DB Architect | `src/lib/types.ts` 존재 및 타입 정의 확인 |
| API Developer | DB Architect, LLM Engineer | `src/lib/types.ts`, `src/lib/supabase/server.ts`, `src/lib/claude.ts` 존재 확인 |
| Page Builder | UI Builder, API Developer | `src/components/` 디렉토리, `src/app/api/` 디렉토리 존재 확인 |
| QA Inspector | 전체 | `src/` 디렉토리 전체 |

## 계층 2: 하네스 에이전트 (품질/운영)

개발 프로세스 전반의 품질을 관리하는 에이전트와 스킬들이다.

### 에이전트

| 에이전트 | 역할 | 트리거 시점 |
|---------|------|-----------|
| **Code Reviewer** | 빌드 에이전트의 결과물 코드 리뷰. 코드 품질, 보안, 성능 검토 | 각 빌드 에이전트 완료 후 |
| **Integration Validator** | 에이전트 간 결과물 인터페이스 정합성 검증 | Phase 합류 지점 (Phase 4, 5 시작 전) |

### 스킬

| 스킬 | 역할 | 검증 항목 |
|------|------|----------|
| `llm-wiki:dependency-gate` | Task 실행 전 선행 조건 검증 | 선행 에이전트 완료 여부, 필요 파일 존재 여부, 타입/인터페이스 호환성 |
| `llm-wiki:progress-track` | 진행 상황 추적 + 다음 실행 가능 Task 제안 | 완료된 Task, 현재 Phase, 병렬 가능 Task |
| `llm-wiki:consistency-lint` | 코드베이스 전체 일관성 검사 | 네이밍 규칙, import 경로, API 응답 타입, Tailwind 클래스 패턴 |
| `llm-wiki:web-ingest` | 웹 페이지 크롤링 및 지식 변환 (구현 완료) | SPA 크롤링, JSON→마크다운 변환 |

### 하네스 워크플로우

```
빌드 에이전트 시작 전:
  1. dependency-gate 스킬 → 선행 조건 확인
  2. 조건 미충족 시 차단 + 사유 보고

빌드 에이전트 완료 후:
  1. Code Reviewer 에이전트 → 코드 리뷰
  2. 리뷰 통과 시 → progress-track 스킬로 상태 업데이트
  3. 리뷰 실패 시 → 빌드 에이전트에 피드백 전달, 재작업

Phase 합류 지점:
  1. Integration Validator 에이전트 → 인터페이스 정합성 검증
  2. consistency-lint 스킬 → 전체 코드 일관성 검사
  3. 검증 통과 시 → 다음 Phase 진행
```

## 계층 3: 런타임 에이전트 (앱 내부)

LLM-wiki 앱이 실제로 동작할 때 내부에서 운영되는 에이전트들이다.
각 에이전트는 `src/lib/claude.ts`의 함수로 구현되며, API Route에서 호출된다.

### 에이전트 목록

| 에이전트 | 역할 | API 엔드포인트 | Claude 프롬프트 |
|---------|------|--------------|----------------|
| **Ingest Agent** | 원본 문서 → 위키 페이지 변환, 크로스레퍼런스 생성 | `POST /api/ingest` | `buildSystemPrompt(config, "ingest")` |
| **Query Agent** | 위키 Full-Text Search + Claude 답변 생성 + 출처 인용 | `POST /api/query` | `buildSystemPrompt(config, "query")` |
| **Lint Agent** | 위키 건강 점검: 모순/고아/누락/오래된 정보 탐지 | `POST /api/lint` | `buildSystemPrompt(config, "lint")` |
| **Chat Agent** | 대화형 위키 질의, 세션 관리, 스트리밍 응답 | `POST /api/chat` | `buildSystemPrompt(config, "chat")` |
| **Schema Guard** | 모든 에이전트 호출 시 schema_config 규칙 주입 | 직접 호출 없음 | `buildSystemPrompt()` 내부 |

### 런타임 에이전트 동작 구조

```
사용자 요청
    │
    ▼
API Route (Next.js)
    │
    ├── schema_config 로드 (Schema Guard)
    ├── 관련 wiki_pages 검색 (Supabase FTS)
    │
    ▼
Claude API 호출
    │
    ├── 시스템 프롬프트 = Schema Guard 규칙 + 오퍼레이션별 지시
    ├── 사용자 프롬프트 = 원본 문서/질문 + 위키 컨텍스트
    │
    ▼
결과 처리
    │
    ├── Ingest: 위키 페이지 생성/업데이트 + change_log 기록
    ├── Query: 답변 반환 + 출처 인용
    ├── Lint: 이슈 목록 반환
    └── Chat: 답변 + 세션 저장
```

### Schema Guard 상세

Schema Guard는 독립 에이전트가 아니라, 모든 런타임 에이전트의 전처리 단계로 동작한다.
`schema_config` 테이블에서 규칙을 로드하여 Claude API 시스템 프롬프트에 주입한다.

주입되는 규칙:
- 카테고리 목록 (위키 페이지 분류 기준)
- 페이지 구조 템플릿 (마크다운 형식)
- 용어 통일 기준 (약어/정식 명칭 매핑)
- 크로스레퍼런스 형식 (`[[페이지슬러그]]`)

## 커스텀 스킬 상세 설계

### 1. `llm-wiki:dependency-gate`

**목적:** 빌드 에이전트 시작 전 선행 조건을 검증하여, 의존성 미충족 상태에서의 작업을 차단한다.

**트리거:** 빌드 에이전트가 Task를 시작하려 할 때

**검증 항목:**
```
1. 선행 에이전트 완료 여부
   - progress-track의 상태 파일에서 완료 기록 확인
2. 필요 파일 존재 여부
   - 의존성 매트릭스에 정의된 파일 경로를 Glob으로 확인
3. 타입/인터페이스 호환성
   - 선행 에이전트가 생성한 타입 정의가 현재 Task에서 사용하는 타입과 일치하는지 Grep으로 확인
```

**출력:**
- 통과: "Gate PASSED — Task N 실행 가능" + 선행 파일 목록
- 차단: "Gate BLOCKED — 사유: [미충족 조건]" + 해결 방법 제안

### 2. `llm-wiki:progress-track`

**목적:** 전체 진행 상황을 파일 기반으로 추적하고, 다음 실행 가능 Task를 제안한다.

**상태 파일:** `llm-wiki/.build-progress.json`

```json
{
  "phases": {
    "1": { "status": "completed", "agents": ["Scaffolder"] },
    "2": { "status": "in_progress", "agents": ["DB Architect", "UI Builder"] },
    "3": { "status": "pending", "agents": ["LLM Engineer"] },
    "4": { "status": "pending", "agents": ["API Developer"] },
    "5": { "status": "pending", "agents": ["Page Builder"] },
    "6": { "status": "pending", "agents": ["QA Inspector"] }
  },
  "tasks": {
    "1": { "status": "completed", "agent": "Scaffolder", "completed_at": "..." },
    "2": { "status": "in_progress", "agent": "DB Architect", "started_at": "..." },
    "3": { "status": "pending" },
    "4": { "status": "in_progress", "agent": "UI Builder", "started_at": "..." }
  },
  "next_available": ["Task 3 (LLM Engineer) — Task 2 완료 후 즉시 가능"]
}
```

**기능:**
- Task 완료 시 상태 업데이트
- 의존성 그래프 기반으로 다음 실행 가능 Task 계산
- 병렬 가능 Task 목록 제공

### 3. `llm-wiki:consistency-lint`

**목적:** 여러 에이전트가 생성한 코드의 일관성을 검사한다.

**검사 항목:**
```
1. 네이밍 일관성
   - API 응답 필드명이 snake_case (DB) vs camelCase (JS) 올바르게 변환되는지
   - 컴포넌트 파일명이 kebab-case인지

2. Import 경로 정합성
   - @/lib/types에서 export한 타입이 실제로 사용처에서 올바르게 import되는지
   - 존재하지 않는 경로를 참조하는 import가 없는지

3. API 스펙 일치
   - API Route의 응답 구조가 프론트엔드에서 기대하는 구조와 일치하는지
   - fetch URL이 실제 API Route 경로와 일치하는지

4. Tailwind 클래스 패턴
   - 컴포넌트 간 동일한 UI 패턴에 동일한 클래스 사용
```

**실행:** Grep + 패턴 매칭으로 자동 검사, 불일치 항목을 리포트

### 4. `llm-wiki:web-ingest` (구현 완료)

SPA 포함 웹 페이지를 Playwright로 크롤링하여 마크다운으로 변환.
`~/.claude/skills/llm-wiki-web-ingest/` 에 위치.

## 실행 전략

### Orchestrator 역할

메인 Claude Code 세션이 Orchestrator 역할을 수행한다.
서브에이전트를 dispatch하고, 하네스 스킬을 실행하고, 결과를 종합한다.

```
Orchestrator (메인 세션)
  │
  ├── Phase 1: Scaffolder 에이전트 dispatch
  │     └── 완료 → Code Reviewer → progress-track 업데이트
  │
  ├── Phase 2: dependency-gate 확인 후
  │     ├── DB Architect 에이전트 dispatch (병렬)
  │     └── UI Builder 에이전트 dispatch   (병렬)
  │     └── 각 완료 → Code Reviewer → progress-track 업데이트
  │
  ├── Phase 합류: Integration Validator + consistency-lint
  │
  ├── Phase 3: dependency-gate → LLM Engineer dispatch
  │     └── 완료 → Code Reviewer → progress-track 업데이트
  │
  ├── Phase 4: dependency-gate → API Developer dispatch
  │     └── 완료 → Code Reviewer → progress-track 업데이트
  │
  ├── Phase 합류: Integration Validator + consistency-lint
  │
  ├── Phase 5: dependency-gate → Page Builder dispatch
  │     ├── Dashboard, Wiki, Ingest, Query, Chat, Lint, Settings (병렬)
  │     └── 각 완료 → Code Reviewer → progress-track 업데이트
  │
  ├── Phase 합류: consistency-lint (전체)
  │
  └── Phase 6: QA Inspector dispatch → 최종 검증
```

### 에이전트 dispatch 방식

각 빌드 에이전트는 Claude Code의 `Agent` 도구로 서브에이전트를 생성한다.
- Phase 간 독립 에이전트 (Scaffolder, DB Architect 등)는 `isolation: "worktree"`로 격리하여 충돌 방지
- 병렬 가능 에이전트는 단일 메시지에 복수 Agent 호출로 동시 실행
- Page Builder의 7개 페이지는 동일 코드베이스의 서로 다른 파일을 건드리므로, worktree 없이 병렬 dispatch (파일 충돌 없음)
- 각 에이전트의 프롬프트에 담당 Task의 전체 코드를 포함

### 에러 핸들링

```
에이전트 실패 시:
  1. Code Reviewer가 실패 사유 분석
  2. 수정 가능한 경우: 동일 에이전트에 피드백 전달 후 재실행
  3. 의존성 문제인 경우: 선행 에이전트 결과물 수정 후 재실행
  4. 3회 실패 시: Orchestrator가 사용자에게 에스컬레이션
```
