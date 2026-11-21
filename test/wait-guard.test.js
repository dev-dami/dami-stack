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

test('sleep durations count their units', () => {
  assert.strictEqual(run({ command: 'sleep 5m' }).status, 2);
  assert.strictEqual(run({ command: 'sleep 1h' }).status, 2);
  assert.strictEqual(run({ command: 'sleep 4m' }).status, 0);
  assert.strictEqual(run({ command: 'sleep 240' }).status, 0);
});

test('a timeout bounds only the command it wraps', () => {
  assert.strictEqual(run({ command: 'timeout 10 true; sleep 300' }).status, 2);
  assert.strictEqual(run({ command: 'timeout 240 sleep 600' }).status, 0);
});

test('a busy poll loop with no sleep is refused', () => {
  assert.strictEqual(run({ command: 'while ! gh run view 123 --exit-status; do :; done' }).status, 2);
});

test('loops that end on their own pass', () => {
  assert.strictEqual(run({ command: 'while read line; do echo "$line"; sleep 1; done < list.txt' }).status, 0);
  assert.strictEqual(run({ command: 'n=0; while [ "$n" -lt 3 ]; do sleep 1; n=$((n+1)); done' }).status, 0);
});
