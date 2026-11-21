// Team progress for a repo, read from the hub's state, else the bench board: running,
// landed, blocked, and when the oldest run started. Read-only; any missing or odd file
// gives null. Shared by the status line and the Stop hook.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { hubPath, teamId } = require('../mcp/store');

// A run marked running counts as alive only while its timeout has not passed (plus 5
// minutes for a remote run's upload and cleanup) and, when its pid is known, that process
// still exists. A worker killed by a reboot leaves its run marked running for good; this
// keeps that ghost from counting. Both must hold, so a pid reused after a reboot can't
// keep a ghost alive. EPERM means the process exists under another user: alive.
function runAlive(run, now = Date.now()) {
  if (!run || run.status !== 'running') return false;
  const minutes = Math.min(Number(run.timeoutMinutes) || 15, 60);
  if (!(now - Number(run.started) < (minutes + 5) * 60000)) return false;
  if (!run.pid) return true; // Started a moment ago, before the worker wrote its pid.
  try {
    process.kill(run.pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function teamCounts(dir) {
  const id = teamId(dir);
  if (id.startsWith('dir-')) return null; // Not a git repo with a commit: no team.
  try {
    const state = JSON.parse(fs.readFileSync(path.join(hubPath(id), 'state.json'), 'utf8'));
    const runs = Object.values(state.runs || {}).filter((r) => runAlive(r));
    const tasks = state.tasks || [];
    const oldest = runs.length ? Math.min(...runs.map((r) => r.started)) : null;
    const counts = { running: runs.length, landed: tasks.filter((t) => t.status === 'done').length, blocked: tasks.filter((t) => t.status === 'blocked').length, oldest };
    if (counts.running || counts.landed || counts.blocked) return counts;
  } catch { /* no hub state */ }
  try {
    const board = fs.readFileSync(path.join(os.homedir(), '.dami', 'bench', id, 'board.md'), 'utf8');
    const count = (re) => (board.match(re) || []).length;
    const counts = { running: count(/\[claimed/g), landed: count(/\[done\]/g), blocked: count(/\[blocked\]/g), oldest: null };
    if (counts.running || counts.landed || counts.blocked) return counts;
  } catch { /* no bench board */ }
  return null;
}

module.exports = { runAlive, teamCounts };
