// Shared hub state. Every agent runs its own server process, so state lives on
// disk and each change happens under a lock that works on every OS.
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const LOCK_STALE_MS = 10000;
const LOCK_WAIT_MS = 8000;
const MAX_MESSAGES = 500;

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// Worktrees of a repo share a root commit, so they share a team.
function teamId(cwd) {
  const r = spawnSync('git', ['-C', cwd, 'rev-list', '--max-parents=0', 'HEAD'], { encoding: 'utf8', windowsHide: true });
  const roots = r.status === 0 ? r.stdout.trim().split(/\r?\n/).filter(Boolean).sort() : [];
  if (roots.length) return roots[0].slice(0, 7);
  return `dir-${crypto.createHash('sha1').update(path.resolve(cwd).toLowerCase()).digest('hex').slice(0, 7)}`;
}

function hubDir(cwd) {
  const base = process.env.DAMI_HUB_DIR || path.join(os.homedir(), '.dami', 'hub');
  const dir = path.join(base, teamId(cwd));
  fs.mkdirSync(path.join(dir, 'runs'), { recursive: true });
  return dir;
}

function acquire(lock) {
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      fs.mkdirSync(lock);
      return;
    } catch (err) {
      if (err.code !== 'EEXIST' && err.code !== 'EPERM') throw err;
    }
    try {
      if (Date.now() - fs.statSync(lock).mtimeMs > LOCK_STALE_MS) fs.rmdirSync(lock);
    } catch { /* another process took it first */ }
    if (Date.now() > deadline) throw new Error('hub is busy, try again');
    sleep(10 + Math.random() * 30);
  }
}

// Windows refuses a rename while another process is reading the target.
function replace(from, to) {
  for (let i = 0; ; i += 1) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (err) {
      if (i >= 50 || !['EPERM', 'EACCES', 'EBUSY'].includes(err.code)) throw err;
      sleep(10);
    }
  }
}

function read(file) {
  const empty = { seq: 0, agents: {}, messages: [], tasks: [], leases: [], notes: [], runs: {} };
  try {
    return { ...empty, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (err) {
    if (err.code === 'ENOENT') return empty;
    throw err;
  }
}

// Runs fn with exclusive access to the state and saves what it leaves behind.
function withState(dir, fn) {
  const lock = path.join(dir, '.lock');
  const file = path.join(dir, 'state.json');
  acquire(lock);
  try {
    const state = read(file);
    const result = fn(state);
    state.messages = state.messages.slice(-MAX_MESSAGES);
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state));
    replace(tmp, file);
    return result;
  } finally {
    fs.rmdirSync(lock);
  }
}

const nextId = (state, prefix) => {
  state.seq += 1;
  return `${prefix}${state.seq}`;
};

module.exports = { hubDir, nextId, teamId, withState };
