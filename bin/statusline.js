#!/usr/bin/env node
// Claude Code status line for dami stack sessions. Reads session JSON on stdin.
const { spawnSync } = require('child_process');
const path = require('path');
const { teamCounts } = require('./team-state');

const ACCENT = '\x1b[38;5;209m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

function teamPart(counts) {
  if (!counts) return null;
  const age = counts.oldest ? ` (oldest ${Math.round((Date.now() - counts.oldest) / 60000)}m)` : '';
  return `${counts.running} running${age}, ${counts.landed} landed, ${counts.blocked} blocked`;
}

let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  let session = {};
  try { session = JSON.parse(input) || {}; } catch { /* an empty status line is still useful */ }
  if (typeof session !== 'object') session = {};

  const dir = (session.workspace && session.workspace.current_dir) || session.cwd || process.cwd();
  const git = spawnSync('git', ['-C', dir, 'branch', '--show-current'], { encoding: 'utf8', windowsHide: true });
  const branch = git.status === 0 ? git.stdout.trim() : '';
  const used = session.context_window && session.context_window.used_percentage;
  const pick = (obj, key, type) => (obj && typeof obj[key] === type ? obj[key] : undefined);
  const model = [pick(session.model, 'display_name', 'string'), pick(session.effort, 'level', 'string')].filter(Boolean).join(' · ');
  const cost = pick(session.cost, 'total_cost_usd', 'number');
  const added = pick(session.cost, 'total_lines_added', 'number') || 0;
  const removed = pick(session.cost, 'total_lines_removed', 'number') || 0;
  const spend = [cost > 0 ? `$${cost.toFixed(2)}` : null, added > 0 || removed > 0 ? `+${added}/-${removed}` : null].filter(Boolean).join(' · ');

  const parts = [
    path.basename(dir) + (branch ? ` (${branch})` : ''),
    model,
    typeof used === 'number' ? `${Math.round(used)}% context` : null,
    spend,
    teamPart(teamCounts(dir)),
    '/dami:help',
  ].filter(Boolean);

  console.log(`${ACCENT}dami stack${RESET}${DIM} | ${parts.join(' | ')}${RESET}`);
});
