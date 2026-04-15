---
name: wiki-content-lint
description: Use when the user asks to lint wiki content ("/wiki-lint", "위키 점검", "lint 실행") or to regenerate the lint report shown in the app's Lint 리포트 page. Produces `lint-report.json` at the project root which the web UI reads via /api/lint.
---

# Wiki Content Lint

위키 페이지의 품질·일관성을 LLM API 호출 없이 Claude Code 세션 안에서 직접 점검하고,
웹앱(`/api/lint`, `/lint`)이 읽는 `lint-report.json`을 프로젝트 루트에 생성한다.

## When to Use

- 사용자가 "lint 실행", "/wiki-lint", "위키 점검", "리포트 갱신" 등을 요청할 때
- 위키 페이지 대량 수정 후 전체 일관성 재검사가 필요할 때

## When NOT to Use

- 코드 레벨 lint (그건 `llm-wiki-consistency-lint` skill)
- 단일 페이지 micro-검사 (그냥 Read로 확인)

## 입력 소스

dev 서버가 떠 있다고 가정하고 HTTP로 위키 페이지를 받는다:

```bash
curl -sS http://localhost:3000/api/wiki > /tmp/wiki-pages.json
```

서버가 없으면 `wiki/*.md` 디스크 파일을 대신 읽는다 (신규 업로드 분만 존재할 수 있음).
어느 쪽이든 페이지 목록 `[{ slug, title, category, content, updated_at, source_ids }, ...]`을 확보한다.

## 검사 항목

각 항목은 `issue_type`, `page_slug`, `description`, `suggestion`을 포함하는 객체로 산출한다.

### 1. `stale` — 오래된 페이지
- `updated_at`이 오늘(현재 세션 날짜) 기준 180일 이상 경과
- suggestion: 언제 갱신했는지 확인하고, 변경 없으면 재확인일 표기 추가

### 2. `orphan` — 고아 페이지
- 다른 페이지 본문에서 이 페이지 slug/title에 대한 링크/언급이 전혀 없음
- 단, 카테고리별 진입점 페이지는 예외(사용자 판단)

### 3. `missing_link` — 누락 링크
- 본문에 다른 페이지 title이 평문으로 등장하지만 `[...](...)` 링크가 아닌 경우
- suggestion: 해당 구문을 `[title](/wiki/slug)`로 변경

### 4. `contradiction` — 모순
- 두 페이지에서 같은 주제에 대해 수치·날짜·정책이 상충
- 가장 주의 깊게 탐지. 확실하지 않으면 건너뛸 것(오탐 < 미탐)
- description에는 두 페이지 모두 언급, page_slug는 더 최근 업데이트된 쪽으로

## 출력 형식

프로젝트 루트에 `lint-report.json` 작성:

```json
{
  "generated_at": "2026-04-15T09:00:00Z",
  "total_pages": 42,
  "issues": [
    {
      "page_slug": "tallcare-plus",
      "issue_type": "stale",
      "description": "마지막 업데이트가 9개월 전입니다.",
      "suggestion": "최신 약관과 비교 후 변경사항이 없다면 updated_at만 갱신하세요."
    }
  ]
}
```

## 실행 순서 (Claude Code)

1. `curl http://localhost:3000/api/wiki`로 페이지 목록 가져오기 (실패 시 `wiki/*.md` 디스크 파일 로드)
2. 각 페이지를 읽고 위 4개 카테고리로 분류
3. 중복 이슈 병합, 오탐 가능성 높은 건 제외
4. `Write` 도구로 `lint-report.json` 저장
5. 사용자에게 "총 N건 이슈, lint-report.json 생성됨. 웹 UI에서 [Lint 실행] 눌러 확인하세요." 보고

## 주의

- API 키 사용 금지. Groq/OpenAI 호출 코드 추가하지 말 것.
- 확신 없는 모순은 포함하지 말 것 — 사용자는 오탐을 가장 싫어함.
- `suggestion`은 구체적 액션 (문구 변경안, 추가할 링크 등)으로 작성.
