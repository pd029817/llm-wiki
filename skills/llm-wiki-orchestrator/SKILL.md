---
name: llm-wiki-orchestrator
description: Use when orchestrating the LLM-Wiki multi-agent build process. Triggers when starting the build, resuming after interruption, or coordinating between build phases.
---

# LLM-Wiki Build Orchestrator

## Overview

LLM-Wiki 멀티 에이전트 빌드를 조율하는 최상위 스킬.
의존성 그래프에 따라 빌드 에이전트를 dispatch하고, 하네스 스킬로 품질을 관리한다.

## When to Use

- LLM-Wiki 빌드를 시작하거나 재개할 때
- "빌드 시작", "다음 Phase 진행", "빌드 상태 확인" 요청 시

## Required Sub-Skills

- `llm-wiki-progress-track`: 진행 상황 추적
- `llm-wiki-dependency-gate`: 선행 조건 검증
- `llm-wiki-consistency-lint`: Phase 합류 시 일관성 검사
- `superpowers:requesting-code-review`: 각 에이전트 결과 리뷰

## 오케스트레이션 루프

```
1. progress-track의 `next` 명령으로 실행 가능 Task 확인
2. 각 Task에 대해 dependency-gate 검증
3. 병렬 가능한 Task는 동시에 Agent 도구로 dispatch
4. 에이전트 완료 시:
   a. Code Reviewer (superpowers:requesting-code-review)
   b. progress-track의 `complete` 명령
5. Phase 합류 지점에서:
   a. consistency-lint 실행
   b. 문제 발견 시 수정 후 재검증
6. 1번으로 돌아가 반복
7. 전체 완료 시 QA Inspector dispatch
```

## 에이전트 dispatch 프롬프트 템플릿

각 빌드 에이전트를 dispatch할 때 아래 정보를 프롬프트에 포함:

```
당신은 LLM-Wiki 프로젝트의 [에이전트 이름]입니다.

작업 디렉토리: llm-wiki/ (프로젝트 루트)
구현 계획 파일: docs/superpowers/plans/2026-04-14-llm-wiki.md

담당 Task: Task [N] — [Task 제목]

이 Task의 모든 Step을 순서대로 실행하세요.
구현 계획 파일에서 Task [N] 섹션을 읽고 그대로 따르세요.
각 Step 완료 후 커밋하세요.
```

## Phase별 체크포인트

| Phase 합류 | 검증 |
|-----------|------|
| Phase 2 → 3 | DB Architect 출력(`types.ts`, `supabase/server.ts`) 존재 확인 |
| Phase 3 → 4 | `claude.ts`의 함수 시그니처가 `types.ts`의 타입과 일치하는지 consistency-lint |
| Phase 4 → 5 | API Route 경로와 프론트엔드 fetch URL 일치 확인 (consistency-lint) |
| Phase 5 → 6 | 전체 consistency-lint + `npx tsc --noEmit` |

## 에러 복구

| 상황 | 대응 |
|------|------|
| 에이전트 타입 에러 | consistency-lint 결과를 피드백으로 전달, 재실행 |
| 빌드 실패 | 에러 로그를 에이전트에 전달, 수정 요청 |
| 3회 연속 실패 | 사용자에게 에스컬레이션 |
| 인터페이스 불일치 | 선행 에이전트의 출력을 수정 후 후속 에이전트 재실행 |

## Common Mistakes

- dependency-gate 없이 에이전트를 dispatch하면 import 에러 발생
- 병렬 에이전트가 같은 파일을 수정하면 충돌 — Page Builder만 파일이 겹치지 않으므로 병렬 안전
- progress-track 업데이트를 잊으면 다음 Phase가 차단됨
