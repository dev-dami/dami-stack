// With a show: line in prefs, publishing a host artifact is refused; other actions pass.
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const HOOK = path.join(__dirname, '..', 'bin', 'show-guard.js');

function guard(prefs, input) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dami-show-'));
  if (prefs !== null) {
    fs.mkdirSync(path.join(home, '.dami'));
    fs.writeFileSync(path.join(home, '.dami', 'prefs.md'), prefs);
  }
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  const r = spawnSync(process.execPath, [HOOK], { env, input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8' });
  fs.rmSync(home, { recursive: true, force: true });
  return r;
}

const SHOW = 'ok: G1 push on agent/* branches\nshow: share <file>\n';

test('publishing with a show: line is refused and names the command', () => {
  const r = guard(SHOW, { tool_name: 'Artifact', tool_input: { file_path: 'x.html' } });
  assert.strictEqual(r.status, 2);
  assert.ok(r.stderr.includes('show via share <file>'));
});

test('an asset upload counts as publishing', () => {
  const r = guard(SHOW, { tool_name: 'Artifact', tool_input: { action: 'publish', asset: true, url: 'u', file_path: 'a.png' } });
  assert.strictEqual(r.status, 2);
});

test('delete and read pass', () => {
  assert.strictEqual(guard(SHOW, { tool_name: 'Artifact', tool_input: { action: 'delete', url: 'u' } }).status, 0);
  assert.strictEqual(guard(SHOW, { tool_name: 'Artifact', tool_input: { action: 'read', url: 'u' } }).status, 0);
});

test('no prefs file passes', () => {
  assert.strictEqual(guard(null, { tool_name: 'Artifact', tool_input: { file_path: 'x.html' } }).status, 0);
});

test('prefs without a show: line pass', () => {
  assert.strictEqual(guard('ok: G1 push on agent/* branches\n', { tool_name: 'Artifact', tool_input: { file_path: 'x.html' } }).status, 0);
});

test('malformed stdin passes', () => {
  assert.strictEqual(guard(SHOW, 'not json').status, 0);
});

test('another server tool that only mentions artifacts passes', () => {
  assert.strictEqual(guard(SHOW, { tool_name: 'mcp__ci__upload_artifact', tool_input: {} }).status, 0);
  assert.strictEqual(guard(SHOW, { tool_name: 'mcp__host__Artifact', tool_input: {} }).status, 2);
});
