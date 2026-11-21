// The checkpoint hook saves uncommitted work under refs/dami/wip/<branch> and touches
// nothing else: not the worktree, not the real index, not HEAD.
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const HOOK = path.join(__dirname, '..', 'bin', 'checkpoint.js');
const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: ENV });
  assert.strictEqual(r.status, 0, r.stderr);
  return r.stdout.trim();
}

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dami-ckpt-'));
  git(dir, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'one\n');
  fs.writeFileSync(path.join(dir, '.gitignore'), 'ignored.txt\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  return dir;
}

function hook(cwd) {
  return spawnSync(process.execPath, [HOOK], { cwd, input: '{"hook_event_name":"Stop"}', encoding: 'utf8', env: ENV });
}

const refSha = (dir) => spawnSync('git', ['rev-parse', '-q', '--verify', 'refs/dami/wip/main'], { cwd: dir, encoding: 'utf8' }).stdout.trim();

test('a dirty tree gets a checkpoint holding tracked edits and new files', () => {
  const dir = repo();
  fs.writeFileSync(path.join(dir, 'a.txt'), 'two\n');
  fs.writeFileSync(path.join(dir, 'new.txt'), 'fresh\n');
  fs.writeFileSync(path.join(dir, 'ignored.txt'), 'secret\n');
  const r = hook(dir);
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '');
  const sha = refSha(dir);
  assert.ok(sha, 'refs/dami/wip/main exists');
  assert.strictEqual(git(dir, 'show', `${sha}:a.txt`), 'two');
  assert.strictEqual(git(dir, 'show', `${sha}:new.txt`), 'fresh');
  assert.ok(!git(dir, 'ls-tree', '--name-only', sha).split('\n').includes('ignored.txt'));
  assert.strictEqual(git(dir, 'rev-parse', `${sha}^`), git(dir, 'rev-parse', 'HEAD'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the worktree status, the real index and HEAD are unchanged', () => {
  const dir = repo();
  fs.writeFileSync(path.join(dir, 'a.txt'), 'two\n');
  fs.writeFileSync(path.join(dir, 'new.txt'), 'fresh\n');
  const statusBefore = git(dir, 'status', '--porcelain');
  const indexBefore = fs.readFileSync(path.join(dir, '.git', 'index'));
  const headBefore = fs.readFileSync(path.join(dir, '.git', 'HEAD'));
  const shaBefore = git(dir, 'rev-parse', 'HEAD');
  assert.strictEqual(hook(dir).status, 0);
  assert.ok(fs.readFileSync(path.join(dir, '.git', 'index')).equals(indexBefore));
  assert.strictEqual(git(dir, 'status', '--porcelain'), statusBefore);
  assert.ok(fs.readFileSync(path.join(dir, '.git', 'HEAD')).equals(headBefore));
  assert.strictEqual(git(dir, 'rev-parse', 'HEAD'), shaBefore);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a clean tree writes no ref', () => {
  const dir = repo();
  assert.strictEqual(hook(dir).status, 0);
  assert.strictEqual(refSha(dir), '');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('running twice with no change keeps the same checkpoint', () => {
  const dir = repo();
  fs.writeFileSync(path.join(dir, 'a.txt'), 'two\n');
  hook(dir);
  const first = refSha(dir);
  hook(dir);
  assert.ok(first);
  assert.strictEqual(refSha(dir), first);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('outside git and on an unborn HEAD it exits 0 silently', () => {
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'dami-nogit-'));
  const r = hook(plain);
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout + r.stderr, '');
  git(plain, 'init', '-q');
  fs.writeFileSync(path.join(plain, 'x.txt'), 'x\n');
  const unborn = hook(plain);
  assert.strictEqual(unborn.status, 0);
  assert.strictEqual(unborn.stdout + unborn.stderr, '');
  fs.rmSync(plain, { recursive: true, force: true });
});
