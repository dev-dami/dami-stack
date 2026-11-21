#!/usr/bin/env node
// Plugin hook on Stop, PreCompact and SessionEnd: save uncommitted work as a commit under
// refs/dami/wip/<branch>, so a restart that kills the session loses minutes, not hours.
// It builds the tree in a temp copy of the index, so the worktree, the real index and the
// branch are never touched, and it pushes nothing. It runs under DAMI_RUN too: hub workers
// are the ones restarts kill. A hook must never break a session, so every error exits 0.
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MESSAGE = 'dami: wip checkpoint';

function git(cwd, args, env) {
  const r = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', ...env },
  });
  return r.status === 0 ? r.stdout.trim() : null;
}

// The ref name for this checkout: the branch, or detached-<short HEAD>.
function wipRef(cwd) {
  const branch = git(cwd, ['branch', '--show-current']);
  if (branch) return `refs/dami/wip/${branch}`;
  const short = git(cwd, ['rev-parse', '--short', 'HEAD']);
  return short ? `refs/dami/wip/detached-${short}` : null;
}

// Returns the new checkpoint sha, or null when nothing was written.
function checkpoint(cwd) {
  const top = git(cwd, ['rev-parse', '--show-toplevel']);
  if (!top) return null;
  const head = git(top, ['rev-parse', '-q', '--verify', 'HEAD^{commit}']);
  if (!head) return null; // Unborn HEAD: nothing to parent a checkpoint on.
  const ref = wipRef(top);
  if (!ref) return null;

  const realIndex = path.resolve(top, git(top, ['rev-parse', '--git-path', 'index']) || '.git/index');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dami-wip-'));
  const index = path.join(tmp, 'index');
  let tree;
  try {
    // Start from the real index so the add only hashes what changed. Keep its mtime too:
    // git trusts cached stat data only for files older than the index, so a fresh mtime
    // on the copy would hide same-size edits made in the second before it.
    if (fs.existsSync(realIndex)) {
      fs.copyFileSync(realIndex, index);
      const { atime, mtime } = fs.statSync(realIndex);
      fs.utimesSync(index, atime, mtime);
    }
    const env = { GIT_INDEX_FILE: index };
    if (git(top, ['add', '-A'], env) === null) return null;
    tree = git(top, ['write-tree'], env);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (!tree) return null;
  if (tree === git(top, ['rev-parse', 'HEAD^{tree}'])) return null; // Clean tree.
  if (tree === git(top, ['rev-parse', '-q', '--verify', `${ref}^{tree}`])) return null; // No change since the last one.

  const sha = git(top, ['-c', 'user.name=dami', '-c', 'user.email=dami@localhost', 'commit-tree', tree, '-p', head, '-m', MESSAGE]);
  if (!sha) return null;
  return git(top, ['update-ref', '--create-reflog', ref, sha]) === null ? null : sha;
}

let ran = false;
function run() {
  if (ran) return;
  ran = true;
  try { checkpoint(process.cwd()); } catch { /* a hook never traps a session */ }
  process.exitCode = 0;
}

if (require.main === module) {
  if (process.stdin.isTTY) run();
  else {
    process.stdin.on('data', () => {});
    process.stdin.on('error', run);
    process.stdin.on('end', run);
  }
}

module.exports = { checkpoint, wipRef };
