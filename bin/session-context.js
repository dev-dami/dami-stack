#!/usr/bin/env node
// Plugin SessionStart hook: its output becomes session context, which is what makes skills proactive.
// A hub-started run (DAMI_RUN set) prints nothing: the MCP server gives it the worker card.
// Otherwise it prints the routing map, the user's standing preferences from ~/.dami/prefs.md,
// this machine's name, and a restore hint when a WIP checkpoint on HEAD holds work the tree lost.
// A hook must never break a session, so any missing file prints nothing and exits 0.
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MAP = path.resolve(__dirname, '..', 'skills', 'ground', 'house-rules', 'routing-map.md');
const PREFS_LIMIT = 1500;

function git(args) {
  const r = spawnSync('git', args, { encoding: 'utf8', windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
  return r.status === 0 ? r.stdout.trim() : null;
}

function age(seconds) {
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

// One line when refs/dami/wip/<branch> sits on the current HEAD and the tree is clean: the
// checkpoint then holds work this tree lost, and git restore brings it back. A checkpoint on
// any other commit would overwrite what HEAD has, so it gets no line, whatever the dates say.
function restoreHint() {
  const branch = git(['branch', '--show-current']);
  if (!branch) return '';
  const ref = `refs/dami/wip/${branch}`;
  const parent = git(['rev-parse', '-q', '--verify', `${ref}^1`]);
  if (!parent || parent !== git(['rev-parse', 'HEAD'])) return '';
  if (git(['status', '--porcelain']) !== '') return '';
  const wipTime = Number(git(['log', '-1', '--format=%ct', ref, '--']));
  if (!wipTime) return '';
  return `WIP checkpoint ${age(Date.now() / 1000 - wipTime)} ago: git restore --source=${ref} --worktree -- .\n`;
}

if (!process.env.DAMI_RUN) {
  try {
    process.stdout.write(fs.readFileSync(MAP, 'utf8'));
  } catch { /* no map, no output */ }
  try {
    // Keep whole lines only: a cut grant line could read wider than the user wrote it.
    let prefs = fs.readFileSync(path.join(os.homedir(), '.dami', 'prefs.md'), 'utf8').trim();
    if (prefs.length > PREFS_LIMIT) prefs = prefs.slice(0, Math.max(prefs.lastIndexOf('\n', PREFS_LIMIT), 0)).trimEnd();
    if (prefs) process.stdout.write(`\n## Your standing preferences\n${prefs}\n`);
  } catch { /* no prefs file */ }
  try {
    process.stdout.write(`\nMachine: ${os.hostname()}\n`);
    process.stdout.write(restoreHint());
  } catch { /* no git, no hint */ }
}
process.exitCode = 0;
