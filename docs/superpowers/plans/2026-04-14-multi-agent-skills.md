# LLM-Wiki 멀티 에이전트 커스텀 스킬 구축 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 멀티 에이전트 개발 프로세스를 지원하는 3개 커스텀 스킬(dependency-gate, progress-track, consistency-lint)과 1개 오케스트레이션 스킬을 구축한다.

**Architecture:** 각 스킬은 `~/.claude/skills/` 하위에 독립 디렉토리로 생성. SKILL.md가 에이전트 행동을 규정하고, 필요 시 보조 스크립트를 포함한다. progress-track은 `.build-progress.json` 파일로 상태를 관리한다.

**Tech Stack:** Claude Code Skills (SKILL.md), Node.js (보조 스크립트), JSON (상태 파일)

---

## 파일 구조

```
~/.claude/skills/
├── llm-wiki-web-ingest/          # (구현 완료)
│   ├── SKILL.md
│   ├── crawl-spa.js
│   └── transform-to-markdown.js
├── llm-wiki-progress-track/      # Task 1
│   ├── SKILL.md
│   └── progress.js
├── llm-wiki-dependency-gate/     # Task 2
│   └── SKILL.md
├── llm-wiki-consistency-lint/    # Task 3
│   └── SKILL.md
└── llm-wiki-orchestrator/        # Task 4
    └── SKILL.md

llm-wiki/
└── .build-progress.json          # Task 1에서 초기화
```

---

## Task 1: `llm-wiki-progress-track` 스킬

**Files:**
- Create: `~/.claude/skills/llm-wiki-progress-track/SKILL.md`
- Create: `~/.claude/skills/llm-wiki-progress-track/progress.js`
- Create: `/Users/testuser/NonDeveloper_Claude-code/llm-wiki/.build-progress.json`

- [ ] **Step 1: 초기 상태 파일 생성**

`/Users/testuser/NonDeveloper_Claude-code/llm-wiki/.build-progress.json`:

```json
{
  "phases": {
    "1": {
      "status": "pending",
      "agents": ["Scaffolder"],
      "tasks": [1]
    },
    "2": {
      "status": "pending",
      "agents": ["DB Architect", "UI Builder"],
      "tasks": [2, 4]
    },
    "3": {
      "status": "pending",
      "agents": ["LLM Engineer"],
      "tasks": [3]
    },
    "4": {
      "status": "pending",
      "agents": ["API Developer"],
      "tasks": [5, 6, 7]
    },
    "5": {
      "status": "pending",
      "agents": ["Page Builder"],
      "tasks": [8, 9, 10, 11, 12, 13, 14]
    },
    "6": {
      "status": "pending",
      "agents": ["QA Inspector"],
      "tasks": [15]
    }
  },
  "tasks": {
    "1":  { "status": "pending", "agent": "Scaffolder", "phase": 1, "deps": [] },
    "2":  { "status": "pending", "agent": "DB Architect", "phase": 2, "deps": [1] },
    "3":  { "status": "pending", "agent": "LLM Engineer", "phase": 3, "deps": [2] },
    "4":  { "status": "pending", "agent": "UI Builder", "phase": 2, "deps": [1] },
    "5":  { "status": "pending", "agent": "API Developer", "phase": 4, "deps": [2, 3] },
    "6":  { "status": "pending", "agent": "API Developer", "phase": 4, "deps": [2, 3] },
    "7":  { "status": "pending", "agent": "API Developer", "phase": 4, "deps": [2, 3] },
    "8":  { "status": "pending", "agent": "Page Builder", "phase": 5, "deps": [4, 5, 6, 7] },
    "9":  { "status": "pending", "agent": "Page Builder", "phase": 5, "deps": [4, 5, 6, 7] },
    "10": { "status": "pending", "agent": "Page Builder", "phase": 5, "deps": [4, 5, 6, 7] },
    "11": { "status": "pending", "agent": "Page Builder", "phase": 5, "deps": [4, 5, 6, 7] },
    "12": { "status": "pending", "agent": "Page Builder", "phase": 5, "deps": [4, 5, 6, 7] },
    "13": { "status": "pending", "agent": "Page Builder", "phase": 5, "deps": [4, 5, 6, 7] },
    "14": { "status": "pending", "agent": "Page Builder", "phase": 5, "deps": [4, 5, 6, 7] },
    "15": { "status": "pending", "agent": "QA Inspector", "phase": 6, "deps": [8, 9, 10, 11, 12, 13, 14] }
  },
  "history": []
}
```

- [ ] **Step 2: progress.js 헬퍼 스크립트 작성**

`~/.claude/skills/llm-wiki-progress-track/progress.js`:

```javascript
#!/usr/bin/env node
/**
 * 빌드 진행 상황 관리 스크립트
 *
 * 사용법:
 *   node progress.js status                    # 전체 상태 출력
 *   node progress.js start <task-number>       # Task 시작
 *   node progress.js complete <task-number>    # Task 완료
 *   node progress.js next                      # 다음 실행 가능 Task 목록
 *   node progress.js reset                     # 전체 초기화
 */

const fs = require("fs");
const path = require("path");

const PROGRESS_FILE = path.resolve(process.cwd(), ".build-progress.json");

function load() {
  if (!fs.existsSync(PROGRESS_FILE)) {
    console.error(`Error: ${PROGRESS_FILE} not found. Run from llm-wiki/ directory.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf-8"));
}

function save(data) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function getNextAvailable(data) {
  const available = [];
  for (const [taskId, task] of Object.entries(data.tasks)) {
    if (task.status !== "pending") continue;
    const depsCompleted = task.deps.every(
      (depId) => data.tasks[String(depId)].status === "completed"
    );
    if (depsCompleted) {
      available.push({ taskId, agent: task.agent, phase: task.phase });
    }
  }
  return available;
}

function updatePhases(data) {
  for (const [phaseId, phase] of Object.entries(data.phases)) {
    const phaseTasks = phase.tasks.map((t) => data.tasks[String(t)]);
    if (phaseTasks.every((t) => t.status === "completed")) {
      phase.status = "completed";
    } else if (phaseTasks.some((t) => t.status === "in_progress" || t.status === "completed")) {
      phase.status = "in_progress";
    } else {
      phase.status = "pending";
    }
  }
}

function printStatus(data) {
  console.log("\n=== LLM-Wiki 빌드 진행 상황 ===\n");

  for (const [phaseId, phase] of Object.entries(data.phases)) {
    const icon = phase.status === "completed" ? "[v]" : phase.status === "in_progress" ? "[>]" : "[ ]";
    console.log(`${icon} Phase ${phaseId}: ${phase.agents.join(", ")} (${phase.status})`);

    for (const taskId of phase.tasks) {
      const task = data.tasks[String(taskId)];
      const tIcon = task.status === "completed" ? "  [v]" : task.status === "in_progress" ? "  [>]" : "  [ ]";
      const time = task.completed_at ? ` (${task.completed_at})` : task.started_at ? ` (started: ${task.started_at})` : "";
      console.log(`${tIcon} Task ${taskId}: ${task.agent}${time}`);
    }
    console.log();
  }

  const next = getNextAvailable(data);
  if (next.length > 0) {
    console.log("--- 다음 실행 가능 ---");
    for (const n of next) {
      console.log(`  Task ${n.taskId} (${n.agent}) — Phase ${n.phase}`);
    }
  }

  const completed = Object.values(data.tasks).filter((t) => t.status === "completed").length;
  const total = Object.keys(data.tasks).length;
  console.log(`\n진행률: ${completed}/${total} (${Math.round((completed / total) * 100)}%)\n`);
}

const command = process.argv[2];
const arg = process.argv[3];

switch (command) {
  case "status": {
    const data = load();
    printStatus(data);
    break;
  }

  case "start": {
    if (!arg) { console.error("Usage: node progress.js start <task-number>"); process.exit(1); }
    const data = load();
    const task = data.tasks[arg];
    if (!task) { console.error(`Task ${arg} not found`); process.exit(1); }

    const depsCompleted = task.deps.every((d) => data.tasks[String(d)].status === "completed");
    if (!depsCompleted) {
      const blocking = task.deps.filter((d) => data.tasks[String(d)].status !== "completed");
      console.error(`BLOCKED: Task ${arg} depends on uncompleted tasks: ${blocking.join(", ")}`);
      process.exit(1);
    }

    task.status = "in_progress";
    task.started_at = new Date().toISOString();
    data.history.push({ action: "start", task: arg, at: task.started_at });
    updatePhases(data);
    save(data);
    console.log(`Task ${arg} (${task.agent}) started.`);
    break;
  }

  case "complete": {
    if (!arg) { console.error("Usage: node progress.js complete <task-number>"); process.exit(1); }
    const data = load();
    const task = data.tasks[arg];
    if (!task) { console.error(`Task ${arg} not found`); process.exit(1); }

    task.status = "completed";
    task.completed_at = new Date().toISOString();
    data.history.push({ action: "complete", task: arg, at: task.completed_at });
    updatePhases(data);
    save(data);

    const next = getNextAvailable(data);
    console.log(`Task ${arg} (${task.agent}) completed.`);
    if (next.length > 0) {
      console.log("다음 실행 가능:");
      for (const n of next) {
        console.log(`  Task ${n.taskId} (${n.agent})`);
      }
    }
    break;
  }

  case "next": {
    const data = load();
    const next = getNextAvailable(data);
    if (next.length === 0) {
      const allDone = Object.values(data.tasks).every((t) => t.status === "completed");
      console.log(allDone ? "모든 Task 완료!" : "현재 실행 가능한 Task 없음 (진행 중인 Task 완료 대기)");
    } else {
      console.log("실행 가능한 Task:");
      for (const n of next) {
        console.log(`  Task ${n.taskId} (${n.agent}) — Phase ${n.phase}`);
      }

      // 병렬 가능 여부
      const agents = [...new Set(next.map((n) => n.agent))];
      if (agents.length > 1) {
        console.log(`\n병렬 실행 가능: ${agents.join(" + ")}`);
      }
    }
    break;
  }

  case "reset": {
    const data = load();
    for (const task of Object.values(data.tasks)) {
      task.status = "pending";
      delete task.started_at;
      delete task.completed_at;
    }
    for (const phase of Object.values(data.phases)) {
      phase.status = "pending";
    }
    data.history = [];
    save(data);
    console.log("진행 상황 초기화 완료.");
    break;
  }

  default:
    console.log("사용법: node progress.js <status|start|complete|next|reset> [task-number]");
}
```

- [ ] **Step 3: SKILL.md 작성**

`~/.claude/skills/llm-wiki-progress-track/SKILL.md`:

```markdown
---
name: llm-wiki-progress-track
description: Use when tracking LLM-Wiki build progress, checking which tasks are done, starting or completing a task, or finding which tasks can run next in the multi-agent pipeline.
---

# LLM-Wiki Progress Tracker

## Overview

LLM-Wiki 멀티 에이전트 빌드의 진행 상황을 `.build-progress.json` 파일로 추적한다.
의존성 그래프 기반으로 다음 실행 가능 Task를 계산하고, 병렬 가능 여부를 판단한다.

## When to Use

- 빌드 에이전트 시작/완료 시 상태 업데이트
- 다음 실행할 Task를 결정할 때
- 전체 진행률을 확인할 때

## Commands

헬퍼 스크립트 위치: `~/.claude/skills/llm-wiki-progress-track/progress.js`
실행 디렉토리: `llm-wiki/` (`.build-progress.json`이 있는 곳)

| 명령 | 용도 |
|------|------|
| `node ~/.claude/skills/llm-wiki-progress-track/progress.js status` | 전체 상태 + 진행률 |
| `node ~/.claude/skills/llm-wiki-progress-track/progress.js next` | 실행 가능 Task + 병렬 가능 여부 |
| `node ~/.claude/skills/llm-wiki-progress-track/progress.js start <N>` | Task N 시작 (의존성 미충족 시 차단) |
| `node ~/.claude/skills/llm-wiki-progress-track/progress.js complete <N>` | Task N 완료 + 다음 가능 Task 표시 |
| `node ~/.claude/skills/llm-wiki-progress-track/progress.js reset` | 전체 초기화 |

## Orchestrator 사용 패턴

```
1. next → 실행 가능 Task 확인
2. start <N> → 시작 기록
3. 에이전트 dispatch
4. complete <N> → 완료 기록
5. next → 다음 단계 확인, 반복
```

## Common Mistakes

- `llm-wiki/` 밖에서 실행하면 `.build-progress.json`을 찾을 수 없음
- `start` 없이 `complete`하면 started_at이 기록되지 않음 (동작에 문제 없으나 이력이 불완전)
```

- [ ] **Step 4: 스크립트 동작 검증**

```bash
cd /Users/testuser/NonDeveloper_Claude-code/llm-wiki
node ~/.claude/skills/llm-wiki-progress-track/progress.js status
node ~/.claude/skills/llm-wiki-progress-track/progress.js next
node ~/.claude/skills/llm-wiki-progress-track/progress.js start 1
node ~/.claude/skills/llm-wiki-progress-track/progress.js complete 1
node ~/.claude/skills/llm-wiki-progress-track/progress.js next
node ~/.claude/skills/llm-wiki-progress-track/progress.js reset
```

Expected:
- `status`: 15개 Task 모두 pending, 진행률 0%
- `next`: Task 1 (Scaffolder) 실행 가능
- `start 1`: "Task 1 (Scaffolder) started."
- `complete 1`: "Task 1 completed." + "다음 실행 가능: Task 2, Task 4"
- `next` (완료 후): Task 2 (DB Architect) + Task 4 (UI Builder) 병렬 가능
- `reset`: 전체 초기화

- [ ] **Step 5: 커밋**

```bash
git add ~/.claude/skills/llm-wiki-progress-track/ llm-wiki/.build-progress.json
git commit -m "feat: add progress-track skill with dependency-aware task tracking"
```

---

## Task 2: `llm-wiki-dependency-gate` 스킬

**Files:**
- Create: `~/.claude/skills/llm-wiki-dependency-gate/SKILL.md`

- [ ] **Step 1: SKILL.md 작성**

`~/.claude/skills/llm-wiki-dependency-gate/SKILL.md`:

```markdown
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
cd /Users/testuser/NonDeveloper_Claude-code/llm-wiki
node ~/.claude/skills/llm-wiki-progress-track/progress.js start <task-number>
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

각 파일의 존재를 Glob으로 확인:

```bash
ls /Users/testuser/NonDeveloper_Claude-code/llm-wiki/src/lib/types.ts 2>/dev/null && echo "EXISTS" || echo "MISSING"
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

검증 방법 (Grep):

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
```

- [ ] **Step 2: Gate 동작 검증 — 차단 케이스**

```bash
cd /Users/testuser/NonDeveloper_Claude-code/llm-wiki
# Task 2는 Task 1에 의존 — Task 1이 pending이므로 차단되어야 함
node ~/.claude/skills/llm-wiki-progress-track/progress.js start 2
```

Expected: "BLOCKED: Task 2 depends on uncompleted tasks: 1"

- [ ] **Step 3: Gate 동작 검증 — 통과 케이스**

```bash
cd /Users/testuser/NonDeveloper_Claude-code/llm-wiki
node ~/.claude/skills/llm-wiki-progress-track/progress.js start 1
node ~/.claude/skills/llm-wiki-progress-track/progress.js complete 1
node ~/.claude/skills/llm-wiki-progress-track/progress.js start 2
```

Expected: "Task 2 (DB Architect) started." (의존성 충족)

```bash
node ~/.claude/skills/llm-wiki-progress-track/progress.js reset
```

- [ ] **Step 4: 커밋**

```bash
git add ~/.claude/skills/llm-wiki-dependency-gate/
git commit -m "feat: add dependency-gate skill for pre-task validation"
```

---

## Task 3: `llm-wiki-consistency-lint` 스킬

**Files:**
- Create: `~/.claude/skills/llm-wiki-consistency-lint/SKILL.md`

- [ ] **Step 1: SKILL.md 작성**

`~/.claude/skills/llm-wiki-consistency-lint/SKILL.md`:

```markdown
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

### 1. Import 경로 정합성

존재하지 않는 경로를 import하는 코드가 있는지 확인:

```bash
# 모든 import 문에서 @/ 경로 추출
grep -r "from ['\"]@/" src/ --include="*.ts" --include="*.tsx" -h | \
  sed "s/.*from ['\"]@\/\([^'\"]*\)['\"].*/\1/" | \
  sort -u | while read p; do
    # .ts, .tsx, /index.ts 등 확인
    found=false
    for ext in "" ".ts" ".tsx" "/index.ts" "/index.tsx" "/route.ts"; do
      if [ -f "src/${p}${ext}" ]; then found=true; break; fi
    done
    if [ "$found" = false ]; then echo "MISSING IMPORT: @/${p}"; fi
  done
```

문제 없으면 출력 없음. MISSING이 나오면 해당 import 경로를 수정해야 함.

### 2. 타입 export/import 일치

`src/lib/types.ts`에서 export한 타입이 실제로 사용처에서 올바르게 참조되는지:

```bash
# types.ts에서 export된 interface/type 목록
grep "export interface\|export type" src/lib/types.ts | sed 's/export \(interface\|type\) \([A-Za-z]*\).*/\2/'

# 사용처에서 import하는 타입 목록
grep -r "from ['\"]@/lib/types['\"]" src/ --include="*.ts" --include="*.tsx" -h | \
  sed 's/.*import.*{\(.*\)}.*/\1/' | tr ',' '\n' | tr -d ' '
```

사용처의 타입 이름이 export 목록에 없으면 불일치.

### 3. API fetch URL과 Route 경로 일치

프론트엔드의 fetch URL이 실제 API Route 파일과 매칭되는지:

```bash
# 프론트엔드에서 사용하는 fetch URL 추출
grep -r "fetch(['\"]\/api" src/app/ --include="*.tsx" -h | \
  sed "s/.*fetch(['\"]\/api\/\([^'\"?]*\)['\"].*/\/api\/\1/" | sort -u

# 실제 API Route 파일 경로
find src/app/api -name "route.ts" | sed 's|src/app||;s|/route.ts||' | sort -u
```

fetch URL에는 있지만 route 파일이 없으면 404 발생.

### 4. 컴포넌트 export 확인

프론트엔드 페이지에서 import하는 컴포넌트가 실제로 export되는지:

```bash
# 컴포넌트 import 목록
grep -r "from ['\"]@/components/" src/app/ --include="*.tsx" -h | \
  sed "s/.*import.*{\(.*\)}.*from.*/\1/" | tr ',' '\n' | tr -d ' ' | sort -u

# 실제 export 목록
grep -r "export function\|export const\|export default" src/components/ --include="*.tsx" -h | \
  sed 's/export \(default \)\?\(function\|const\) \([A-Za-z]*\).*/\3/' | sort -u
```

import에는 있지만 export에 없으면 불일치.

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
- dynamic import (`import()`)는 이 검사로 잡히지 않음
- `[slug]` 같은 동적 라우트는 fetch URL 매칭에서 수동 확인 필요
```

- [ ] **Step 2: 커밋**

```bash
git add ~/.claude/skills/llm-wiki-consistency-lint/
git commit -m "feat: add consistency-lint skill for cross-agent code verification"
```

---

## Task 4: `llm-wiki-orchestrator` 스킬

**Files:**
- Create: `~/.claude/skills/llm-wiki-orchestrator/SKILL.md`

- [ ] **Step 1: SKILL.md 작성**

`~/.claude/skills/llm-wiki-orchestrator/SKILL.md`:

```markdown
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

작업 디렉토리: /Users/testuser/NonDeveloper_Claude-code/llm-wiki
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
```

- [ ] **Step 2: 커밋**

```bash
git add ~/.claude/skills/llm-wiki-orchestrator/
git commit -m "feat: add orchestrator skill for multi-agent build coordination"
```

---

## Task 5: 전체 스킬 통합 검증

**Files:** 없음 (검증 단계)

- [ ] **Step 1: 모든 스킬 디렉토리 확인**

```bash
ls -la ~/.claude/skills/llm-wiki-*/
```

Expected: 4개 디렉토리 (web-ingest, progress-track, dependency-gate, consistency-lint, orchestrator)

- [ ] **Step 2: progress-track 전체 플로우 테스트**

```bash
cd /Users/testuser/NonDeveloper_Claude-code/llm-wiki

# 초기 상태
node ~/.claude/skills/llm-wiki-progress-track/progress.js status

# Phase 1: Scaffolder
node ~/.claude/skills/llm-wiki-progress-track/progress.js start 1
node ~/.claude/skills/llm-wiki-progress-track/progress.js complete 1

# Phase 2: DB Architect + UI Builder (병렬 가능 확인)
node ~/.claude/skills/llm-wiki-progress-track/progress.js next

# DB Architect 시작/완료
node ~/.claude/skills/llm-wiki-progress-track/progress.js start 2
node ~/.claude/skills/llm-wiki-progress-track/progress.js complete 2

# UI Builder 시작/완료
node ~/.claude/skills/llm-wiki-progress-track/progress.js start 4
node ~/.claude/skills/llm-wiki-progress-track/progress.js complete 4

# Phase 3: LLM Engineer
node ~/.claude/skills/llm-wiki-progress-track/progress.js next
node ~/.claude/skills/llm-wiki-progress-track/progress.js start 3
node ~/.claude/skills/llm-wiki-progress-track/progress.js complete 3

# 최종 상태 확인
node ~/.claude/skills/llm-wiki-progress-track/progress.js status

# 초기화
node ~/.claude/skills/llm-wiki-progress-track/progress.js reset
```

Expected:
- `next` (Phase 1 후): Task 2 + Task 4 병렬 가능
- `next` (Phase 2 후): Task 3 실행 가능
- `status` (Phase 3 후): 진행률 27% (4/15)
- 의존성 차단이 정확히 작동

- [ ] **Step 3: dependency-gate 차단 테스트**

```bash
cd /Users/testuser/NonDeveloper_Claude-code/llm-wiki

# Task 5는 Task 2, 3에 의존 — 둘 다 미완료이므로 차단
node ~/.claude/skills/llm-wiki-progress-track/progress.js start 5
```

Expected: "BLOCKED: Task 5 depends on uncompleted tasks: 2, 3"

```bash
node ~/.claude/skills/llm-wiki-progress-track/progress.js reset
```

- [ ] **Step 4: 커밋**

```bash
git add -A
git commit -m "test: verify all multi-agent skills integration"
```
