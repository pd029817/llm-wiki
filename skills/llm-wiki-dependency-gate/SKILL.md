---
name: llm-wiki-dependency-gate
description: Use before starting any LLM-Wiki build task to verify prerequisites are met. Triggers when an agent is about to begin a task, when dependency conflicts are suspected, or when checking if a phase can proceed.
---

# LLM-Wiki Dependency Gate

## Overview

빌드 에이전트가 Task를 시작하기 전 선행 조건을 검증한다.
조건 미충족 시 작업을 차단하고 사유를 보고한다.

## When to Use

- 빌드 에이전트가 Task를 시작하려 할 때 (매번)
- Phase 합류 지점에서 다음 Phase 진행 전
- 의존성 충돌이 의심될 때

## Gate 검증 절차

Task를 시작하기 전 아래 3단계를 순서대로 검증한다. 하나라도 실패하면 차단.

### 1. 선행 Task 완료 확인

```bash
cd llm-wiki  # 프로젝트 루트에서 실행
node skills/llm-wiki-progress-track/progress.js start <task-number>
```

`start` 명령이 "BLOCKED"를 반환하면 선행 Task가 미완료. 차단.

### 2. 필요 파일 존재 확인

Task별 필요 파일 매트릭스:

| Task | 에이전트 | 필요 파일 |
|------|---------|----------|
| 1 | Scaffolder | (없음) |
| 2 | DB Architect | `package.json` |
| 3 | LLM Engineer | `src/lib/types.ts` |
| 4 | UI Builder | `package.json` |
| 5,6,7 | API Developer | `src/lib/types.ts`, `src/lib/supabase/server.ts`, `src/lib/claude.ts` |
| 8~14 | Page Builder | `src/components/nav.tsx`, `src/components/markdown-viewer.tsx`, `src/app/api/wiki/route.ts` |
| 15 | QA Inspector | `src/app/layout.tsx`, `package.json` |

각 파일의 존재를 확인:

```bash
ls src/lib/types.ts 2>/dev/null && echo "EXISTS" || echo "MISSING"
```

하나라도 MISSING이면 차단.

### 3. 타입/인터페이스 호환성 확인 (Phase 합류 지점만)

Phase 4 시작 전 (API Developer):
- `src/lib/types.ts`에서 `WikiPage`, `RawSource`, `ChangeLog`, `SchemaConfig`, `ChatSession` 타입이 export되는지 확인
- `src/lib/claude.ts`에서 `runIngest`, `runQuery`, `runLint`, `runChat` 함수가 export되는지 확인

Phase 5 시작 전 (Page Builder):
- `src/app/api/wiki/route.ts`에서 GET handler가 export되는지 확인
- `src/components/nav.tsx`에서 `Nav` 컴포넌트가 export되는지 확인
- `src/components/markdown-viewer.tsx`에서 `MarkdownViewer`가 export되는지 확인

검증 방법:

```bash
grep -l "export.*WikiPage" src/lib/types.ts && echo "OK" || echo "MISSING: WikiPage export"
grep -l "export.*runIngest" src/lib/claude.ts && echo "OK" || echo "MISSING: runIngest export"
```

## Gate 출력 형식

통과:
```
GATE PASSED — Task <N> (<agent>) 실행 가능
  선행 Task: [1, 2] (모두 완료)
  필요 파일: [types.ts, claude.ts] (모두 존재)
  인터페이스: [WikiPage, runIngest] (모두 확인)
```

차단:
```
GATE BLOCKED — Task <N> (<agent>) 실행 불가
  사유: Task 2 (DB Architect) 미완료
  해결: Task 2를 먼저 완료하세요
```

## Common Mistakes

- Gate 없이 Task를 시작하면 import 에러, 타입 불일치 등 발생
- Phase 합류 지점에서 인터페이스 검증을 건너뛰면 API-프론트엔드 불일치 발생
