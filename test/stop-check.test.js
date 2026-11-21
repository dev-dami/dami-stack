// The Stop hook nudges once for a missing status shape while work runs, and for GitHub
// links hidden behind markdown text. It stays silent otherwise.
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const HOOK = path.join(__dirname, '..', 'bin', 'stop-check.js');
const PR = 'https://github.com/o/r/pull/3';

// Runs in an empty temp dir with an empty hub, so no real team state leaks in.
function check(input, extra = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dami-stop-'));
  const env = { ...process.env, HOME: tmp, USERPROFILE: tmp, DAMI_HUB_DIR: path.join(tmp, 'hub'), DAMI_RUN: '', DAMI_STOP_CHECK: '', ...extra };
  const body = typeof input === 'string' ? input : JSON.stringify({ cwd: tmp, ...input });
  const r = spawnSync(process.execPath, [HOOK], { cwd: tmp, env, input: body, encoding: 'utf8' });
  fs.rmSync(tmp, { recursive: true, force: true });
  assert.strictEqual(r.status, 0);
  return r.stdout;
}

test('running work without a Done: line is blocked', () => {
  const out = JSON.parse(check({ background_tasks: [{ id: 'b1' }], last_assistant_message: 'All set.' }));
  assert.strictEqual(out.decision, 'block');
  assert.ok(out.reason.includes('Done:'));
});

test('running work with a Done: no line passes', () => {
  assert.strictEqual(check({ background_tasks: [{ id: 'b1' }], last_assistant_message: 'Done: no\n## Running  tests' }), '');
});

test('a silent wake while work runs passes', () => {
  assert.strictEqual(check({ background_tasks: [{ id: 'b1' }], last_assistant_message: '' }), '');
  assert.strictEqual(check({ background_tasks: [{ id: 'b1' }], last_assistant_message: '  \n' }), '');
});

test('a bold Done: line passes', () => {
  assert.strictEqual(check({ background_tasks: [{ id: 'b1' }], last_assistant_message: '**Done:** no\n## Running  tests' }), '');
});

test('a second stop in a row passes', () => {
  assert.strictEqual(check({ stop_hook_active: true, background_tasks: [{ id: 'b1' }], last_assistant_message: 'All set.' }), '');
});

test('a GitHub link behind markdown text is blocked with the raw URL', () => {
  const out = JSON.parse(check({ last_assistant_message: `Opened [PR #3](${PR})` }));
  assert.strictEqual(out.decision, 'block');
  assert.ok(out.reason.includes(PR));
  assert.ok(!out.reason.includes('Done:'));
});

test('the same link also shown bare passes', () => {
  assert.strictEqual(check({ last_assistant_message: `Opened [PR #3](${PR})\n\n## Links\n${PR}` }), '');
});

test('empty stdin passes', () => {
  assert.strictEqual(check(''), '');
});

test('hub workers pass', () => {
  assert.strictEqual(check({ background_tasks: [{ id: 'b1' }], last_assistant_message: `All set [PR](${PR})` }, { DAMI_RUN: '1' }), '');
});

test('DAMI_STOP_CHECK=0 turns it off', () => {
  assert.strictEqual(check({ last_assistant_message: `Opened [PR #3](${PR})` }, { DAMI_STOP_CHECK: '0' }), '');
});

test('without last_assistant_message it reads the transcript tail', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dami-tx-'));
  const file = path.join(tmp, 't.jsonl');
  const line = (role, text) => JSON.stringify({ type: role, message: { role, content: [{ type: 'text', text }] } });
  fs.writeFileSync(file, `${line('user', 'go')}\n${line('assistant', `Opened [PR #3](${PR})`)}\n`);
  const out = JSON.parse(check({ transcript_path: file }));
  assert.ok(out.reason.includes(PR));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('links to files or other hosts pass', () => {
  assert.strictEqual(check({ last_assistant_message: 'See [x](https://github.com/o/r/blob/main/x.js) and [d](https://example.com/a)' }), '');
});

// A repo with one commit and a hub state holding the given runs, as the hook would read it.
function hubRepo(runs) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dami-stop-hub-'));
  const repo = path.join(tmp, 'repo');
  fs.mkdirSync(repo);
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
  const git = (...args) => spawnSync('git', args, { cwd: repo, env, encoding: 'utf8' }).stdout.trim();
  git('init', '-q');
  git('commit', '-q', '--allow-empty', '-m', 'init');
  const hub = path.join(tmp, 'hub');
  const team = path.join(hub, git('rev-list', '--max-parents=0', 'HEAD').slice(0, 7));
  fs.mkdirSync(team, { recursive: true });
  fs.writeFileSync(path.join(team, 'state.json'), JSON.stringify({ runs }));
  const stop = (msg) => {
    const r = spawnSync(process.execPath, [HOOK], {
      cwd: repo, env: { ...process.env, HOME: tmp, DAMI_HUB_DIR: hub, DAMI_RUN: '', DAMI_STOP_CHECK: '' }, input: JSON.stringify({ cwd: repo, last_assistant_message: msg }), encoding: 'utf8',
    });
    return r.stdout;
  };
  return { stop, done: () => fs.rmSync(tmp, { recursive: true, force: true }) };
}

test('a ghost hub run, dead pid or long past its timeout, does not block', () => {
  const deadPid = spawnSync(process.execPath, ['-e', '0']).pid;
  const ghosts = hubRepo({
    r1: { status: 'running', pid: deadPid, started: Date.now() - 3 * 3600000, timeoutMinutes: 15 },
    r2: { status: 'running', pid: deadPid, started: Date.now() - 60000, timeoutMinutes: 15 },
    r3: { status: 'running', pid: process.pid, started: Date.now() - 3 * 3600000, timeoutMinutes: 15 },
  });
  assert.strictEqual(ghosts.stop('All set.'), '');
  ghosts.done();

  const live = hubRepo({ r1: { status: 'running', pid: process.pid, started: Date.now() - 60000, timeoutMinutes: 15 } });
  assert.strictEqual(JSON.parse(live.stop('All set.')).decision, 'block');
  live.done();
});
