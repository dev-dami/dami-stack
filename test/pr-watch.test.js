// pr-watch runs against a stand-in gh that serves JSON fixtures, with HOME in a temp folder.
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const WATCH = path.join(__dirname, '..', 'skills', 'prove', 'merge-case', 'scripts', 'pr-watch.js');
const FAKE = path.join(__dirname, 'fixtures', 'fake-gh.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dami-pr-watch-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const HEAD = 'abc1234';
const URL = 'https://github.com/acme/widgets/pull/7';
const check = (name, conclusion) => ({ __typename: 'CheckRun', name, status: 'COMPLETED', conclusion, detailsUrl: `https://ci.example/${name}` });
const view = (over = {}) => ({
  number: 7, url: URL, state: 'OPEN', isDraft: false, mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN',
  headRefOid: HEAD, reviewDecision: '', statusCheckRollup: [check('lint', 'SUCCESS'), check('test', 'SUCCESS')],
  comments: [], reviews: [], author: { login: 'author' }, ...over,
});

let n = 0;
function setup(fixture) {
  n += 1;
  const home = path.join(tmp, `home-${n}`);
  fs.mkdirSync(home);
  const file = path.join(tmp, `fixture-${n}.json`);
  fs.writeFileSync(file, JSON.stringify(fixture));
  return { home, file };
}
function watch({ home, file }, args) {
  return spawnSync(process.execPath, [WATCH, ...args], {
    env: { ...process.env, HOME: home, USERPROFILE: home, DAMI_GH: FAKE, FAKE_GH_FIXTURE: file },
    encoding: 'utf8',
    timeout: 20000,
  });
}

test('a failing check exits 1 with its name and link', () => {
  const env = setup({ view: view({ statusCheckRollup: [check('lint', 'SUCCESS'), check('test', 'FAILURE')] }) });
  const r = watch(env, ['7', '--until', 'green']);
  assert.strictEqual(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /^check-failed test https:\/\/ci\.example\/test$/m);

  // The same state again is nothing new: silent, and exit 3 when the chunk ends.
  const again = watch(env, ['7', '--until', 'green', '--max-seconds', '1', '--interval', '1']);
  assert.strictEqual(again.status, 3, again.stdout + again.stderr);
  assert.strictEqual(again.stdout, '');
});

test('green checks on a clean PR meet --until green', () => {
  const r = watch(setup({ view: view() }), [URL, '--until', 'green']);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^checks-done pass$/m);
});

test('--until ready reports ready, and a live watcher keeps a second one out', () => {
  const env = setup({ view: view() });
  const r = watch(env, ['7']);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^ready$/m);

  fs.writeFileSync(path.join(env.home, '.dami', 'pr-watch', 'acme-widgets-7.lock'), String(process.pid));
  const second = watch(env, ['7']);
  assert.strictEqual(second.status, 2);
  assert.match(second.stdout + second.stderr, new RegExp(`already watching \\(pid ${process.pid}\\)`));

  // A lock left by a dead process is taken over.
  fs.writeFileSync(path.join(env.home, '.dami', 'pr-watch', 'acme-widgets-7.lock'), '999999');
  assert.strictEqual(watch(env, ['7']).status, 0);
});

test('rate-limited GraphQL falls back to REST, and a new review comment is a thread', () => {
  const env = setup({
    view: view(),
    graphqlError: 'GraphQL: API rate limit exceeded for user ID 1.',
    rest: [{ id: 501, user: { login: 'reviewer' }, path: 'src/a.js', line: 12, html_url: `${URL}#discussion_r501` }],
  });
  const r = watch(env, ['7']);
  assert.strictEqual(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /^thread reviewer src\/a\.js:12 https:\/\/github\.com\/acme\/widgets\/pull\/7#discussion_r501$/m);
});

test('reviews, comments and bots: changes requested exits 1, the author and old bot reviews stay quiet', () => {
  const env = setup({
    view: view({
      reviews: [
        { id: 'R1', author: { login: 'coderabbitai' }, state: 'COMMENTED', commit: { oid: 'old0000' } },
        { id: 'R2', author: { login: 'greptile-apps[bot]' }, state: 'COMMENTED', commit: { oid: HEAD } },
        { id: 'R3', author: { login: 'maintainer' }, state: 'CHANGES_REQUESTED', commit: { oid: HEAD } },
      ],
      comments: [
        { id: 'C1', author: { login: 'author' }, url: `${URL}#c1` },
        { id: 'C2', author: { login: 'vercel' }, url: `${URL}#c2` },
      ],
    }),
  });
  const r = watch(env, ['7']);
  assert.strictEqual(r.status, 1);
  assert.deepStrictEqual(r.stdout.trim().split('\n'), ['checks-done pass', 'bot-review greptile-apps[bot]', 'review maintainer CHANGES_REQUESTED']);
});

test('--max-seconds above 240 is capped, with a note on stderr', () => {
  const r = watch(setup({ view: view() }), ['7', '--max-seconds', '900']);
  assert.strictEqual(r.status, 0);
  assert.match(r.stderr, /240/);
});

test('bad input exits 2', () => {
  const env = setup({ view: view() });
  assert.strictEqual(watch(env, ['--until', 'soon']).status, 2);
  assert.strictEqual(watch(env, ['not-a-pr']).status, 2);
  assert.strictEqual(watch(setup({ view: {} }), ['7']).status, 2);
});

test('merged exits 0, and a behind branch exits 1', () => {
  assert.strictEqual(watch(setup({ view: view({ state: 'MERGED' }) }), ['7']).status, 0);
  const behind = watch(setup({ view: view({ mergeStateStatus: 'BEHIND' }) }), ['7']);
  assert.strictEqual(behind.status, 1);
  assert.match(behind.stdout, /^behind$/m);
});
