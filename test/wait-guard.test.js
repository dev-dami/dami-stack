// The Bash wait guard runs as a real hook: JSON on stdin, exit 2 to refuse.
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const GUARD = path.join(__dirname, '..', 'bin', 'wait-guard.js');
const run = (toolInput, raw) => spawnSync(process.execPath, [GUARD], {
  input: raw !== undefined ? raw : JSON.stringify({ tool_name: 'Bash', tool_input: toolInput }),
  encoding: 'utf8',
});

test('a long timeout alone is only a ceiling and passes', () => {
  assert.strictEqual(run({ command: 'npm test', timeout: 600000 }).status, 0);
});

test('a long literal sleep is refused with the fix', () => {
  const r = run({ command: 'sleep 600 && cat out.log' });
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /Split the wait/);
});

test('a short for-retry loop with backoff passes', () => {
  assert.strictEqual(run({ command: 'for i in 1 2 3; do git push && break; sleep 4; done' }).status, 0);
});

test('a background call passes, whatever its timeout', () => {
  assert.strictEqual(run({ command: 'until ready; do sleep 30; done', timeout: 600000, run_in_background: true }).status, 0);
});

test('a chunked wait under timeout 240 passes', () => {
  assert.strictEqual(run({ command: 'timeout 240 sh -c "until test -f done; do sleep 15; done"', timeout: 250000 }).status, 0);
});

test('a poll loop with no timeout is refused', () => {
  assert.strictEqual(run({ command: 'while ! curl -s localhost:3000; do sleep 10; done' }).status, 2);
});

test('plain commands and short sleeps pass, and bad input never blocks', () => {
  assert.strictEqual(run({ command: 'ls' }).status, 0);
  assert.strictEqual(run({ command: 'sleep 3 && curl -s localhost:3000' }).status, 0);
  assert.strictEqual(run(null, 'not json').status, 0);
  assert.strictEqual(spawnSync(process.execPath, [GUARD], { input: JSON.stringify({ tool_name: 'Read', tool_input: { timeout: 900000 } }) }).status, 0);
});
