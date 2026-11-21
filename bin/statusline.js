#!/usr/bin/env node
// Claude Code status line for dami stack sessions. Reads session JSON on stdin.
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ACCENT = '\x1b[38;5;209m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

// Team progress from the hub's state, else the bench board: running, landed, blocked,
// and how long the oldest run has gone. Read-only; any missing or odd file shows nothing.
function teamCounts(dir) {
  const git = spawnSync('git', ['-C', dir, 'rev-list', '--max-parents=0', 'HEAD'], { encoding: 'utf8', windowsHide: true });
  const [root] = git.status === 0 ? git.stdout.trim().split(/\r?\n/).filter(Boolean).sort() : [];
  if (!root) return null;
  const id = root.slice(0, 7);
  const dami = path.join(os.homedir(), '.dami');
  try {
    const state = JSON.parse(fs.readFileSync(path.join(process.env.DAMI_HUB_DIR || path.join(dami, 'hub'), id, 'state.json'), 'utf8'));
    const runs = Object.values(state.runs || {}).filter((r) => r.status === 'running');
    const tasks = state.tasks || [];
    const oldest = runs.length ? Math.min(...runs.map((r) => r.started)) : null;
    const counts = { running: runs.length, landed: tasks.filter((t) => t.status === 'done').length, blocked: tasks.filter((t) => t.status === 'blocked').length, oldest };
    if (counts.running || counts.landed || counts.blocked) return counts;
  } catch { /* no hub state */ }
  try {
    const board = fs.readFileSync(path.join(dami, 'bench', id, 'board.md'), 'utf8');
    const count = (re) => (board.match(re) || []).length;
    const counts = { running: count(/\[claimed/g), landed: count(/\[done\]/g), blocked: count(/\[blocked\]/g), oldest: null };
    if (counts.running || counts.landed || counts.blocked) return counts;
  } catch { /* no bench board */ }
  return null;
}

function teamPart(counts) {
  if (!counts) return null;
  const age = counts.oldest ? ` (oldest ${Math.round((Date.now() - counts.oldest) / 60000)}m)` : '';
  return `${counts.running} running${age}, ${counts.landed} landed, ${counts.blocked} blocked`;
}

let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  let session = {};
  try { session = JSON.parse(input); } catch { /* an empty status line is still useful */ }

  const dir = (session.workspace && session.workspace.current_dir) || session.cwd || process.cwd();
  const git = spawnSync('git', ['-C', dir, 'branch', '--show-current'], { encoding: 'utf8', windowsHide: true });
  const branch = git.status === 0 ? git.stdout.trim() : '';
  const used = session.context_window && session.context_window.used_percentage;

  const parts = [
    path.basename(dir) + (branch ? ` (${branch})` : ''),
    session.model && session.model.display_name,
    typeof used === 'number' ? `${Math.round(used)}% context` : null,
    teamPart(teamCounts(dir)),
    '/dami:help',
  ].filter(Boolean);

  console.log(`${ACCENT}dami stack${RESET}${DIM} | ${parts.join(' | ')}${RESET}`);
});
