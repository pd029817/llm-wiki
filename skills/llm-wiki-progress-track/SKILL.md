---
name: llm-wiki-progress-track
description: Use when tracking LLM-Wiki build progress, checking which tasks are done, starting or completing a task, or finding which tasks can run next in the multi-agent pipeline.
---

# LLM-Wiki Progress Track

Dependency-aware task tracker for the LLM-Wiki multi-agent build pipeline. Tracks 15 tasks across 6 phases with automatic dependency gating and phase status updates.

## Commands

All commands run from the project root (`llm-wiki/`):

```bash
node skills/llm-wiki-progress-track/progress.js <command> [args]
```

### `status`

Print all phases, tasks, and overall progress percentage.

```bash
node skills/llm-wiki-progress-track/progress.js status
```

### `next`

List tasks whose dependencies are all completed. Shows parallel possibilities.

```bash
node skills/llm-wiki-progress-track/progress.js next
```

### `start <N>`

Mark task N as `in_progress`. **Blocks with an error if any dependency is not completed.**

```bash
node skills/llm-wiki-progress-track/progress.js start 1
```

### `complete <N>`

Mark task N as `completed`. Automatically shows the next available tasks.

```bash
node skills/llm-wiki-progress-track/progress.js complete 1
```

### `reset`

Reset all tasks and phases to `pending`. Clears history.

```bash
node skills/llm-wiki-progress-track/progress.js reset
```

## Orchestrator Usage Pattern

The orchestrator follows this loop to drive the build:

```
next -> start N -> dispatch agent -> complete N -> next -> ...
```

1. **`next`** — find available tasks (deps satisfied)
2. **`start N`** — mark task as in-progress (dependency gate enforced)
3. **Dispatch** — launch the assigned agent for the task
4. **`complete N`** — mark task done, see what unlocked
5. **`next`** — repeat until all tasks completed

When `next` returns multiple tasks, they can be dispatched to agents in parallel.

## Data File

The state is stored in `.build-progress.json` in the project root. It contains:

- **phases** — 6 phases with status, assigned agents, and task lists
- **tasks** — 15 tasks with status, agent, phase, and dependency list
- **history** — timestamped log of start/complete actions
