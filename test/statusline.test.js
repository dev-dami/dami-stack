// The status line shows model and effort, context, cost and lines, and survives odd input.
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const SCRIPT = path.join(__dirname, '..', 'bin', 'statusline.js');

function line(input) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dami-sl-'));
  const env = { ...process.env, HOME: tmp, USERPROFILE: tmp, DAMI_HUB_DIR: path.join(tmp, 'hub') };
  const r = spawnSync(process.execPath, [SCRIPT], { cwd: tmp, env, input, encoding: 'utf8' });
  fs.rmSync(tmp, { recursive: true, force: true });
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout.trimEnd().split('\n').length, 1);
  return r.stdout;
}

test('a full session shows effort, context, cost and lines', () => {
  const out = line(JSON.stringify({
    model: { display_name: 'Opus 5.5' },
    effort: { level: 'high' },
    cost: { total_cost_usd: 4.123, total_lines_added: 120, total_lines_removed: 30 },
    context_window: { used_percentage: 41.6 },
  }));
  assert.ok(out.includes('Opus 5.5 · high'));
  assert.ok(out.includes('$4.12 · +120/-30'));
  assert.ok(out.includes('42% context'));
  assert.ok(out.indexOf('42% context') < out.indexOf('$4.12'));
});

test('zero cost with no lines shows no cost part', () => {
  const out = line(JSON.stringify({ model: { display_name: 'Opus 5.5' }, cost: { total_cost_usd: 0 } }));
  assert.ok(!out.includes('$'));
});

test('empty or broken input still prints one line', () => {
  for (const input of ['{}', 'not json', 'null', '']) assert.ok(line(input).includes('dami stack'));
});
