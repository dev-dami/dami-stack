// check-stack's role-agent and always-on rules, run on a scratch copy of the repo with one file broken.
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');
const COPY = ['.claude-plugin', 'agents', 'bin', 'commands', 'hooks', 'skills'];

// Copies the parts check-stack reads, applies edit(dir), and runs check-stack there.
const checkWith = (edit) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-stack-'));
  try {
    for (const part of COPY) fs.cpSync(path.join(ROOT, part), path.join(dir, part), { recursive: true });
    edit(dir);
    return spawnSync(process.execPath, [path.join(dir, 'bin', 'check-stack.js')], { encoding: 'utf8' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};
const rewrite = (dir, rel, from, to) => {
  const file = path.join(dir, rel);
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(from.test(text), `${rel} lacks ${from}`);
  fs.writeFileSync(file, text.replace(from, to));
};

test('the repo passes and prints the always-on total under its ceiling', () => {
  const r = checkWith(() => {});
  assert.strictEqual(r.status, 0, r.stderr);
  const [, total, ceiling] = /always-on (\d+) of (\d+) characters/.exec(r.stdout) || [];
  assert.ok(Number(total) > 0 && Number(total) <= Number(ceiling), r.stdout);
});

test('a checker with no tools line fails, naming the edit tools it would inherit', () => {
  const r = checkWith((dir) => rewrite(dir, 'agents/checker.md', /^tools:.*\n/m, ''));
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /agents\/checker\.md: .*Edit\/Write/);
});

test('a scout that lists Edit fails', () => {
  const r = checkWith((dir) => rewrite(dir, 'agents/scout.md', /^tools: (.*)$/m, 'tools: $1, Edit'));
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /agents\/scout\.md: read-only role lists Edit/);
});

test('a checker on opus fails on model routing', () => {
  const r = checkWith((dir) => rewrite(dir, 'agents/checker.md', /^model: .*$/m, 'model: opus'));
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /agents\/checker\.md: model "opus" breaks model routing/);
});

test('a Models table row that drifts from the agent map fails', () => {
  const r = checkWith((dir) => rewrite(dir, 'skills/ground/house-rules/levels.md', /\| Opus 5\.5 at medium effort, high for the hardest card \|/, '| Sonnet 5.5 |'));
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /levels\.md: the row for dami:worker must name Opus/);
});

test('an agent whose name differs from its file, or whose description is long, fails', () => {
  const r = checkWith((dir) => {
    rewrite(dir, 'agents/judge.md', /^name: .*$/m, 'name: referee');
    rewrite(dir, 'agents/worker.md', /^description: .*$/m, `description: "${'x'.repeat(130)}"`);
  });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /agents\/judge\.md: name "referee" differs/);
  assert.match(r.stderr, /agents\/worker\.md: description is 130 characters/);
});

test('descriptions over the always-on ceiling fail with the total and the ceiling', () => {
  const r = checkWith((dir) => {
    fs.writeFileSync(path.join(dir, 'commands', 'padding.md'), `---\ndescription: "${'y'.repeat(1500)}"\n---\nBody.\n`);
  });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /always-on: descriptions total \d+ characters, over the ceiling of \d+/);
});

test('a prefixed skill name in a skill file still fails, while agent names pass', () => {
  const r = checkWith((dir) => fs.appendFileSync(path.join(dir, 'skills/ground/house-rules/levels.md'), '\nSee dami:finish-line.\n'));
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /prefixed command or skill name: dami:finish-line/);
  assert.doesNotMatch(r.stderr, /dami:scout|dami:worker/);
});
