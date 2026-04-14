---
name: llm-wiki-consistency-lint
description: Use when multiple agents have written code and you need to verify cross-agent consistency. Triggers at phase merge points, after parallel agent work completes, or when import errors or type mismatches are suspected.
---

# LLM-Wiki Consistency Lint

## Overview

여러 빌드 에이전트가 생성한 코드의 일관성을 검사한다.
Phase 합류 지점에서 실행하여 에이전트 간 인터페이스 불일치를 조기에 탐지한다.

## When to Use

- Phase 합류 지점 (Phase 4, 5 시작 전)
- 3~4개 Task 완료 후 주기적 점검
- import 에러나 타입 불일치가 의심될 때

## When NOT to Use

- 단일 에이전트가 작업 중일 때 (아직 합류할 코드가 없음)
- QA Inspector 단계 (빌드/타입 체크로 대체)

## 검사 항목 및 명령

모든 명령은 프로젝트 루트(`llm-wiki/`) 디렉토리에서 실행.

### 1. Import 경로 정합성

존재하지 않는 경로를 import하는 코드가 있는지 확인:

```bash
grep -r "from ['\"]@/" src/ --include="*.ts" --include="*.tsx" -h | \
  sed "s/.*from ['\"]@\/\([^'\"]*\)['\"].*/\1/" | \
  sort -u | while read p; do
    found=false
    for ext in "" ".ts" ".tsx" "/index.ts" "/index.tsx" "/route.ts"; do
      if [ -f "src/${p}${ext}" ]; then found=true; break; fi
    done
    if [ "$found" = false ]; then echo "MISSING IMPORT: @/${p}"; fi
  done
```

### 2. 타입 export/import 일치

```bash
# types.ts에서 export된 interface/type 목록
grep "export interface\|export type" src/lib/types.ts | sed 's/export \(interface\|type\) \([A-Za-z]*\).*/\2/'

# 사용처에서 import하는 타입 목록
grep -r "from ['\"]@/lib/types['\"]" src/ --include="*.ts" --include="*.tsx" -h | \
  sed 's/.*import.*{\(.*\)}.*/\1/' | tr ',' '\n' | tr -d ' '
```

### 3. API fetch URL과 Route 경로 일치

```bash
# 프론트엔드에서 사용하는 fetch URL 추출
grep -r "fetch(['\"]\/api" src/app/ --include="*.tsx" -h | \
  sed "s/.*fetch(['\"]\/api\/\([^'\"?]*\)['\"].*/\/api\/\1/" | sort -u

# 실제 API Route 파일 경로
find src/app/api -name "route.ts" | sed 's|src/app||;s|/route.ts||' | sort -u
```

### 4. 컴포넌트 export 확인

```bash
# 컴포넌트 import 목록
grep -r "from ['\"]@/components/" src/app/ --include="*.tsx" -h | \
  sed "s/.*import.*{\(.*\)}.*from.*/\1/" | tr ',' '\n' | tr -d ' ' | sort -u

# 실제 export 목록
grep -r "export function\|export const\|export default" src/components/ --include="*.tsx" -h | \
  sed 's/export \(default \)\?\(function\|const\) \([A-Za-z]*\).*/\3/' | sort -u
```

## 리포트 형식

```
=== LLM-Wiki Consistency Lint Report ===

[PASS] Import 경로 정합성: 모든 import 경로 유효
[FAIL] 타입 일치: ChatMessage가 types.ts에서 export되지 않음
[PASS] API URL 일치: 모든 fetch URL에 대응하는 route 존재
[PASS] 컴포넌트 export: 모든 컴포넌트 정상 export

결과: 1건 실패 — 수정 필요
```

## Common Mistakes

- src 디렉토리 밖에서 실행하면 경로가 맞지 않음
- dynamic import는 이 검사로 잡히지 않음
- `[slug]` 같은 동적 라우트는 fetch URL 매칭에서 수동 확인 필요
