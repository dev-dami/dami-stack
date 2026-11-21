// The session hook injects prefs; a grant line cut by the size limit must not appear.
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const HOOK = path.join(__dirname, '..', 'bin', 'session-context.js');

test('prefs past the limit keep whole lines only', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dami-prefs-'));
  fs.mkdirSync(path.join(home, '.dami'));
  const first = `taste: ${'x'.repeat(1450)}`;
  const grant = 'ok: G1 push on agent/* branches; except agent/release-*';
  fs.writeFileSync(path.join(home, '.dami', 'prefs.md'), `${first}\n${grant}\n`);
  const env = { ...process.env, HOME: home, USERPROFILE: home, DAMI_RUN: '' };
  const out = spawnSync(process.execPath, [HOOK], { env, encoding: 'utf8' }).stdout;
  assert.ok(out.includes(first));
  assert.ok(!out.includes('ok: G1'));
  fs.rmSync(home, { recursive: true, force: true });
});

const CHECKPOINT = path.join(__dirname, '..', 'bin', 'checkpoint.js');
const GIT_ENV = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };

function run(cwd, extra = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dami-home-'));
  const env = { ...process.env, ...GIT_ENV, HOME: home, USERPROFILE: home, DAMI_RUN: '', ...extra };
  const out = spawnSync(process.execPath, [HOOK], { cwd, env, encoding: 'utf8' }).stdout;
  fs.rmSync(home, { recursive: true, force: true });
  return out;
}

function git(cwd, args, env = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV, ...env } });
  assert.strictEqual(r.status, 0, r.stderr);
}

// A repo whose HEAD commit is an hour old, so a checkpoint made now is newer.
function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dami-ctx-'));
  git(dir, ['init', '-q', '-b', 'main']);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'one\n');
  git(dir, ['add', '-A']);
  const old = new Date(Date.now() - 3600 * 1000).toISOString();
  git(dir, ['commit', '-q', '-m', 'init'], { GIT_COMMITTER_DATE: old, GIT_AUTHOR_DATE: old });
  return dir;
}

test('the Machine line shows without DAMI_RUN and not with it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dami-ctx-'));
  assert.ok(run(dir).includes(`Machine: ${os.hostname()}`));
  assert.strictEqual(run(dir, { DAMI_RUN: 'r1' }), '');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the restore line shows only for a clean tree and a checkpoint on HEAD', () => {
  const dir = repo();
  assert.ok(!run(dir).includes('WIP checkpoint'), 'no ref, no line');

  fs.writeFileSync(path.join(dir, 'a.txt'), 'two\n');
  spawnSync(process.execPath, [CHECKPOINT], { cwd: dir, input: '{}', env: { ...process.env, ...GIT_ENV } });
  assert.ok(!run(dir).includes('WIP checkpoint'), 'dirty tree, no line');

  git(dir, ['checkout', '--', 'a.txt']);
  const out = run(dir);
  assert.ok(out.includes('WIP checkpoint '), 'clean tree and newer ref');
  assert.ok(out.includes('git restore --source=refs/dami/wip/main --worktree -- .'));
  assert.ok(!out.includes('stash'));

  fs.writeFileSync(path.join(dir, 'b.txt'), 'later\n');
  git(dir, ['add', '-A']);
  const later = new Date(Date.now() + 3600 * 1000).toISOString();
  git(dir, ['commit', '-q', '-m', 'later'], { GIT_COMMITTER_DATE: later, GIT_AUTHOR_DATE: later });
  assert.ok(!run(dir).includes('WIP checkpoint'), 'HEAD newer than the ref, no line');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('no restore line once HEAD moves to another commit, even one with an older date', () => {
  const dir = repo();
  fs.writeFileSync(path.join(dir, 'a.txt'), 'wip\n');
  spawnSync(process.execPath, [CHECKPOINT], { cwd: dir, input: '{}', env: { ...process.env, ...GIT_ENV } });
  git(dir, ['checkout', '--', 'a.txt']);
  assert.ok(run(dir).includes('WIP checkpoint '), 'checkpoint on HEAD, clean tree');

  // A teammate's commit pulled in later, with a committer date older than the checkpoint.
  fs.writeFileSync(path.join(dir, 'a.txt'), 'theirs\n');
  fs.writeFileSync(path.join(dir, 'g.txt'), 'new\n');
  git(dir, ['add', '-A']);
  const older = new Date(Date.now() - 1800 * 1000).toISOString();
  git(dir, ['commit', '-q', '-m', 'theirs'], { GIT_COMMITTER_DATE: older, GIT_AUTHOR_DATE: older });
  assert.ok(!run(dir).includes('WIP checkpoint'), 'checkpoint parent is not HEAD, no line');
  fs.rmSync(dir, { recursive: true, force: true });
});
