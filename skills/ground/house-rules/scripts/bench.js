#!/usr/bin/env node
// Prints the bench path for the current folder and creates the bench if it is missing.
// Node built-ins only, and os.homedir() for the home folder, so cmd.exe, PowerShell and Git Bash agree.
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

function git(...args) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    }).trim();
  } catch {
    return '';
  }
}

function repoId() {
  // Histories joined from several repos have several roots. Sorting picks the same one in every worktree.
  const [root] = git('rev-list', '--max-parents=0', 'HEAD').split(/\r?\n/).filter(Boolean).sort();
  if (root) return root.slice(0, 7);

  // Outside git, or in a repo with no commits yet.
  const folder = fs.realpathSync(git('rev-parse', '--show-toplevel') || process.cwd());
  const key = process.platform === 'win32' ? folder.toLowerCase() : folder;
  return 'dir-' + crypto.createHash('sha256').update(key).digest('hex').slice(0, 7);
}

const bench = path.join(os.homedir(), '.dami', 'bench', repoId());
for (const dir of ['packets', 'reports', 'charts', 'notes']) {
  fs.mkdirSync(path.join(bench, dir), { recursive: true });
}
// Append mode creates board.md when missing and leaves an existing board untouched.
fs.closeSync(fs.openSync(path.join(bench, 'board.md'), 'a'));

console.log(bench);
