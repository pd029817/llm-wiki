#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const PROGRESS_FILE = path.join(process.cwd(), '.build-progress.json');

function load() {
  if (!fs.existsSync(PROGRESS_FILE)) {
    console.error(`Error: ${PROGRESS_FILE} not found. Run from the project root.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
}

function save(data) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2) + '\n');
}

function updatePhaseStatuses(data) {
  for (const [phaseId, phase] of Object.entries(data.phases)) {
    const taskStatuses = phase.tasks.map(t => data.tasks[String(t)].status);
    if (taskStatuses.every(s => s === 'completed')) {
      phase.status = 'completed';
    } else if (taskStatuses.some(s => s === 'in_progress' || s === 'completed')) {
      phase.status = 'in_progress';
    } else {
      phase.status = 'pending';
    }
  }
}

function getNextAvailable(data) {
  const available = [];
  for (const [taskId, task] of Object.entries(data.tasks)) {
    if (task.status !== 'pending') continue;
    const depsCompleted = task.deps.every(d => data.tasks[String(d)].status === 'completed');
    if (depsCompleted) {
      available.push({ id: taskId, ...task });
    }
  }
  return available;
}

function cmdStatus() {
  const data = load();
  const totalTasks = Object.keys(data.tasks).length;
  const completed = Object.values(data.tasks).filter(t => t.status === 'completed').length;
  const inProgress = Object.values(data.tasks).filter(t => t.status === 'in_progress').length;
  const pending = totalTasks - completed - inProgress;
  const pct = Math.round((completed / totalTasks) * 100);

  console.log('=== LLM-Wiki Build Progress ===\n');
  console.log(`Progress: ${completed}/${totalTasks} tasks completed (${pct}%)`);
  console.log(`  Completed:   ${completed}`);
  console.log(`  In Progress: ${inProgress}`);
  console.log(`  Pending:     ${pending}\n`);

  console.log('--- Phases ---');
  for (const [phaseId, phase] of Object.entries(data.phases)) {
    const icon = phase.status === 'completed' ? '[done]' : phase.status === 'in_progress' ? '[....]' : '[    ]';
    console.log(`  Phase ${phaseId} ${icon} ${phase.status.padEnd(12)} agents: ${phase.agents.join(', ')}  tasks: ${phase.tasks.join(', ')}`);
  }

  console.log('\n--- Tasks ---');
  for (const [taskId, task] of Object.entries(data.tasks)) {
    const icon = task.status === 'completed' ? '[done]' : task.status === 'in_progress' ? '[....]' : '[    ]';
    console.log(`  Task ${taskId.padStart(2)} ${icon} ${task.status.padEnd(12)} agent: ${task.agent.padEnd(15)} phase: ${task.phase}  deps: [${task.deps.join(', ')}]`);
  }
}

function cmdStart(taskId) {
  if (!taskId) { console.error('Usage: progress.js start <task_id>'); process.exit(1); }
  const data = load();
  const task = data.tasks[String(taskId)];
  if (!task) { console.error(`Error: Task ${taskId} not found.`); process.exit(1); }
  if (task.status !== 'pending') { console.error(`Error: Task ${taskId} is already ${task.status}.`); process.exit(1); }

  const unmetDeps = task.deps.filter(d => data.tasks[String(d)].status !== 'completed');
  if (unmetDeps.length > 0) {
    console.error(`BLOCKED: Task ${taskId} has unmet dependencies: [${unmetDeps.join(', ')}]`);
    console.error('The following tasks must be completed first:');
    for (const dep of unmetDeps) {
      const dt = data.tasks[String(dep)];
      console.error(`  Task ${dep} (${dt.agent}) - status: ${dt.status}`);
    }
    process.exit(1);
  }

  task.status = 'in_progress';
  data.history.push({ action: 'start', task: Number(taskId), agent: task.agent, timestamp: new Date().toISOString() });
  updatePhaseStatuses(data);
  save(data);
  console.log(`Task ${taskId} (${task.agent}) started.`);
}

function cmdComplete(taskId) {
  if (!taskId) { console.error('Usage: progress.js complete <task_id>'); process.exit(1); }
  const data = load();
  const task = data.tasks[String(taskId)];
  if (!task) { console.error(`Error: Task ${taskId} not found.`); process.exit(1); }
  if (task.status === 'completed') { console.error(`Error: Task ${taskId} is already completed.`); process.exit(1); }
  if (task.status === 'pending') { console.error(`Error: Task ${taskId} has not been started yet.`); process.exit(1); }

  task.status = 'completed';
  data.history.push({ action: 'complete', task: Number(taskId), agent: task.agent, timestamp: new Date().toISOString() });
  updatePhaseStatuses(data);
  save(data);
  console.log(`Task ${taskId} (${task.agent}) completed.`);

  const next = getNextAvailable(data);
  if (next.length > 0) {
    console.log(`\nNext available tasks:`);
    for (const t of next) {
      console.log(`  Task ${t.id} - ${t.agent} (Phase ${t.phase})`);
    }
    if (next.length > 1) {
      console.log(`\n  ** ${next.length} tasks can run in parallel **`);
    }
  } else {
    const allDone = Object.values(data.tasks).every(t => t.status === 'completed');
    if (allDone) {
      console.log('\nAll tasks completed! Build is done.');
    }
  }
}

function cmdNext() {
  const data = load();
  const next = getNextAvailable(data);
  if (next.length === 0) {
    const allDone = Object.values(data.tasks).every(t => t.status === 'completed');
    if (allDone) {
      console.log('All tasks completed! Build is done.');
    } else {
      console.log('No tasks available. Waiting for in-progress tasks to complete.');
    }
    return;
  }

  console.log('Available tasks (deps satisfied):');
  for (const t of next) {
    console.log(`  Task ${t.id} - ${t.agent} (Phase ${t.phase})`);
  }
  if (next.length > 1) {
    console.log(`\n  ** ${next.length} tasks can run in parallel **`);
  }
}

function cmdReset() {
  const data = load();
  for (const task of Object.values(data.tasks)) {
    task.status = 'pending';
  }
  for (const phase of Object.values(data.phases)) {
    phase.status = 'pending';
  }
  data.history = [];
  save(data);
  console.log('All tasks and phases reset to pending. History cleared.');
}

// --- Main ---
const [,, command, ...args] = process.argv;

switch (command) {
  case 'status':   cmdStatus(); break;
  case 'start':    cmdStart(args[0]); break;
  case 'complete': cmdComplete(args[0]); break;
  case 'next':     cmdNext(); break;
  case 'reset':    cmdReset(); break;
  default:
    console.log('Usage: progress.js <command> [args]');
    console.log('Commands:');
    console.log('  status          Show all phases, tasks, and progress');
    console.log('  start <N>       Mark task N as in_progress (blocks if deps unmet)');
    console.log('  complete <N>    Mark task N as completed, show next available');
    console.log('  next            List tasks whose deps are all completed');
    console.log('  reset           Reset all tasks to pending');
    process.exit(command ? 1 : 0);
}
