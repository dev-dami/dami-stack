// Team progress for a repo, read from the hub's state, else the bench board: running,
// landed, blocked, and when the oldest run started. Read-only; any missing or odd file
// gives null. Shared by the status line and the Stop hook.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { hubPath, teamId } = require('../mcp/store');

function teamCounts(dir) {
  const id = teamId(dir);
  if (id.startsWith('dir-')) return null; // Not a git repo with a commit: no team.
  try {
    const state = JSON.parse(fs.readFileSync(path.join(hubPath(id), 'state.json'), 'utf8'));
    const runs = Object.values(state.runs || {}).filter((r) => r.status === 'running');
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

module.exports = { teamCounts };
