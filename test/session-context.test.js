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
