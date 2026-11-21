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
