#!/usr/bin/env node
// Claude Code status line for dami stack sessions. Reads session JSON on stdin.
const { spawnSync } = require('child_process');
const path = require('path');

const ACCENT = '\x1b[38;5;209m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

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
    '/dami:help',
  ].filter(Boolean);

  console.log(`${ACCENT}dami stack${RESET}${DIM} | ${parts.join(' | ')}${RESET}`);
});
