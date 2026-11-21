#!/usr/bin/env node
// pr-watch: watch one GitHub pull request and print one line per new event.
//
//   node pr-watch.js [<pr number|url>] [--repo o/r] [--until ready|green|any-change]
//                    [--max-seconds N] [--interval S]
//
// Stdout carries only events, `<kind> <detail>`, so each line can wake an agent.
// Exit: 0 the --until condition holds, or merged; 1 an event needs action;
// 2 usage or gh error, or another watcher holds this PR; 3 the chunk ran out with
// nothing new, and nothing is printed. --max-seconds defaults to 240 and is capped
// there, so one Bash call stays inside the wait rule; 0 means unbounded, for a
// monitor or background run. State in ~/.dami/pr-watch/ means a restart repeats nothing.
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CAP = 240;
const FIELDS = 'number,url,state,isDraft,mergeable,mergeStateStatus,headRefOid,reviewDecision,statusCheckRollup,comments,reviews,author';
const REVIEW_BOTS = ['coderabbitai', 'greptile', 'greptile-apps', 'macroscope', 'macroscopeapp', 'cursor', 'copilot-pull-request-reviewer'];
// CI and deploy bots report through checks, so their comments add nothing.
const STATUS_BOTS = ['github-actions', 'vercel', 'netlify', 'codecov'];
const FAILED = ['FAILURE', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'ERROR'];
const ACTION = ['check-failed', 'comment', 'thread', 'behind', 'dirty', 'closed'];
const THREADS = `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){
reviewThreads(last:100){nodes{isResolved path line comments(last:1){nodes{databaseId url author{login}}}}}}}}`;

const say = (line) => process.stdout.write(`${line}\n`);
const note = (line) => process.stderr.write(`pr-watch: ${line}\n`);
function die(message, code = 2) {
  // Fatal lines go to stdout too, so a monitor shows why the watch stopped.
  say(`pr-watch: ${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = { pr: null, repo: null, until: 'ready', maxSeconds: CAP, interval: 30 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) die(`${arg} needs a value`);
      i += 1;
      return argv[i];
    };
    const number = (text) => {
      if (!/^\d+$/.test(text)) die(`${arg} takes a whole number of seconds`);
      return Number(text);
    };
    if (arg === '--repo') opts.repo = value();
    else if (arg === '--until') opts.until = value();
    else if (arg === '--max-seconds') opts.maxSeconds = number(value());
    else if (arg === '--interval') opts.interval = Math.max(1, number(value()));
    else if (arg === '-h' || arg === '--help') die('usage: pr-watch.js [<pr>] [--repo o/r] [--until ready|green|any-change] [--max-seconds N] [--interval S]', 0);
    else if (!arg.startsWith('-') && !opts.pr) opts.pr = arg;
    else die(`unknown argument ${arg}`);
  }
  if (!['ready', 'green', 'any-change'].includes(opts.until)) die('--until takes ready, green or any-change');
  if (opts.pr && !/^\d+$/.test(opts.pr) && !/\/pull\/\d+/.test(opts.pr)) die(`${opts.pr} is not a PR number or URL`);
  if (opts.repo && !/^[\w.-]+\/[\w.-]+$/.test(opts.repo)) die('--repo takes owner/name');
  if (opts.maxSeconds > CAP) {
    note(`--max-seconds ${opts.maxSeconds} capped at ${CAP}, so one Bash call stays inside the wait rule. Use 0 under a monitor or background run.`);
    opts.maxSeconds = CAP;
  }
  return opts;
}

// gh through an args array, never a shell. DAMI_GH swaps in a stand-in for tests.
function gh(args) {
  const bin = process.env.DAMI_GH || 'gh';
  const [file, list] = bin.endsWith('.js') ? [process.execPath, [bin, ...args]] : [bin, args];
  const r = spawnSync(file, list, { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (r.error) return { ok: false, error: r.error.code === 'ENOENT' ? `${bin} not found` : r.error.message };
  if (r.status !== 0) return { ok: false, error: (r.stderr || r.stdout || `exit ${r.status}`).trim() };
  try {
    return { ok: true, data: JSON.parse(r.stdout) };
  } catch {
    return { ok: false, error: `unreadable output from gh ${args[0]} ${args[1]}` };
  }
}

function viewPr(opts) {
  return gh(['pr', 'view', ...(opts.pr ? [opts.pr] : []), ...(opts.repo ? ['--repo', opts.repo] : []), '--json', FIELDS]);
}

// Unresolved threads from GraphQL. When GraphQL is rate-limited, REST stands in: it can't
// tell resolved threads apart, so it returns each thread's last comment with partial set,
// and a partial read never counts as ready. Each thread's id is its last comment's id.
function threads(owner, name, number) {
  const q = gh(['api', 'graphql', '-f', `query=${THREADS}`, '-f', `owner=${owner}`, '-f', `name=${name}`, '-F', `number=${number}`]);
  if (q.ok) {
    const nodes = (((((q.data || {}).data || {}).repository || {}).pullRequest || {}).reviewThreads || {}).nodes || [];
    const list = nodes.filter((t) => !t.isResolved).map((t) => {
      const last = ((t.comments || {}).nodes || [])[0] || {};
      return { id: last.databaseId, login: (last.author || {}).login || 'ghost', path: t.path, line: t.line, url: last.url };
    });
    return { list, partial: false };
  }
  if (!/rate limit/i.test(q.error)) throw new Error(q.error);
  const r = gh(['api', `repos/${owner}/${name}/pulls/${number}/comments?per_page=100`]);
  if (!r.ok) throw new Error(r.error);
  const last = new Map(); // Thread root id -> its latest comment. Replies carry in_reply_to_id.
  for (const c of Array.isArray(r.data) ? r.data : []) {
    const root = c.in_reply_to_id || c.id;
    const held = last.get(root);
    if (!held || c.id > held.id) last.set(root, c);
  }
  const list = [...last.values()].map((c) => ({
    id: c.id, login: (c.user || {}).login || 'ghost', path: c.path, line: c.line || c.original_line, url: c.html_url,
  }));
  return { list, partial: true };
}

const isBot = (login) => /\[bot\]$/.test(login) || REVIEW_BOTS.includes(login) || STATUS_BOTS.includes(login);
const reviewBot = (login) => REVIEW_BOTS.includes(login.replace(/\[bot\]$/, ''));

function checkState(rollup) {
  const checks = (rollup || []).map((c) => ({
    name: c.name || c.context || 'check',
    url: c.detailsUrl || c.targetUrl || '-',
    done: c.status ? c.status === 'COMPLETED' : !['PENDING', 'EXPECTED'].includes(c.state),
    failed: FAILED.includes(c.conclusion || c.state),
  }));
  return { checks, done: checks.every((c) => c.done), failed: checks.filter((c) => c.failed) };
}

// Turns one snapshot into events, each with a stable id for de-duplication.
function events(pr, threadList, state, partial = false) {
  const out = [];
  const add = (id, line) => out.push({ id, line, kind: line.split(' ')[0] });
  const head = pr.headRefOid;
  const me = (pr.author || {}).login;
  if (state.head && state.head !== head) add(`head:${head}`, `head-moved ${head}`);

  const checks = checkState(pr.statusCheckRollup);
  checks.failed.forEach((c) => add(`fail:${head}:${c.name}`, `check-failed ${c.name} ${c.url}`));
  // Right after a push GitHub may list no checks yet; give it a minute before calling that green.
  const settling = !checks.checks.length && Date.now() - (state.headSince || 0) < 60000;
  const green = checks.done && !checks.failed.length && !settling;
  if (checks.checks.length && checks.done) add(`done:${head}`, `checks-done ${checks.failed.length ? 'fail' : 'pass'}`);

  const verdicts = {}; // Each human's latest verdict; reviewDecision is empty when reviews aren't required.
  for (const r of pr.reviews || []) {
    const login = (r.author || {}).login || 'ghost';
    if (login === me || r.state === 'PENDING') continue;
    if (reviewBot(login) || /\[bot\]$/.test(login)) {
      if ((r.commit || {}).oid === head) add(`review:${r.id}`, `bot-review ${login}`);
    } else {
      add(`review:${r.id}`, `review ${login} ${r.state}`);
      if (r.state !== 'COMMENTED') verdicts[login] = r.state;
    }
  }
  for (const c of pr.comments || []) {
    const login = (c.author || {}).login || 'ghost';
    if (login === me || (isBot(login) && !reviewBot(login))) continue;
    out.push({ id: `comment:${c.id || c.url}`, line: `comment ${login} ${c.url}`, kind: reviewBot(login) ? 'bot-comment' : 'comment' });
  }
  // A thread whose last word is the author's is answered, waiting on the other side.
  const open = threadList.filter((t) => t.login !== me);
  open.forEach((t) => add(`thread:${t.id}`, `thread ${t.login} ${t.path}:${t.line} ${t.url}`));

  const merge = pr.mergeStateStatus;
  if (merge === 'BEHIND') add(`behind:${head}`, 'behind');
  if (merge === 'DIRTY') add(`dirty:${head}`, 'dirty');
  const ready = green && pr.mergeable === 'MERGEABLE' && !['BEHIND', 'DIRTY'].includes(merge)
    && pr.reviewDecision !== 'CHANGES_REQUESTED' && !Object.values(verdicts).includes('CHANGES_REQUESTED') && !open.length
    && !partial; // Threads unread or read from REST: resolution unknown, so never call it ready.
  if (ready) add(`ready:${head}`, 'ready');
  return { list: out, green, ready };
}

function lockOrExit(lock) {
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  for (let tries = 0; tries < 2; tries += 1) {
    try {
      fs.writeFileSync(lock, String(process.pid), { flag: 'wx' });
      return;
    } catch (err) {
      if (err.code !== 'EEXIST') die(`cannot write ${lock}: ${err.message}`);
    }
    const pid = Number(fs.readFileSync(lock, 'utf8').trim());
    let alive = false;
    try {
      process.kill(pid, 0);
      alive = pid > 0;
    } catch (err) {
      alive = err.code === 'EPERM';
    }
    if (alive && pid !== process.pid) die(`already watching (pid ${pid})`);
    fs.rmSync(lock, { force: true }); // A dead watcher's lock: take it over.
  }
  die(`cannot take ${lock}`);
}

const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } };
const pause = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const deadline = opts.maxSeconds ? Date.now() + opts.maxSeconds * 1000 : Infinity;
  const first = viewPr(opts);
  if (!first.ok) die(first.error);
  const where = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(first.data.url || '');
  if (!where) die(`gh returned no PR URL for ${opts.pr || 'this branch'}`);
  const [, owner, name, number] = where;
  opts.pr = number;
  opts.repo = `${owner}/${name}`;

  const base = path.join(os.homedir(), '.dami', 'pr-watch', `${owner}-${name}-${number}`);
  const lock = `${base}.lock`;
  lockOrExit(lock);
  const release = () => fs.rmSync(lock, { force: true });
  process.on('exit', release);
  ['SIGINT', 'SIGTERM', 'SIGHUP'].forEach((sig) => process.on(sig, () => process.exit(130)));

  const state = { seen: [], ...readJson(`${base}.json`) };
  const seen = new Set(state.seen);
  const save = () => {
    state.seen = [...seen].slice(-1000);
    fs.writeFileSync(`${base}.json`, JSON.stringify(state));
  };

  let pr = first.data;
  let misses = 0;
  let warned = false;
  for (;;) {
    let threadList = [];
    let partial = true;
    try {
      ({ list: threadList, partial } = threads(owner, name, number));
      if (partial && !warned) { note('threads read from REST, resolution unknown'); warned = true; }
    } catch (err) {
      note(`threads unread this poll: ${err.message}`);
    }
    if (state.head !== pr.headRefOid) state.headSince = Date.now();
    const snap = events(pr, threadList, state, partial);
    state.head = pr.headRefOid;
    const fresh = snap.list.filter((e) => !seen.has(e.id));
    fresh.forEach((e) => { seen.add(e.id); say(e.line); });
    save();

    if (pr.state === 'MERGED') { say('merged'); process.exit(0); }
    if (pr.state === 'CLOSED') { say('closed'); process.exit(1); }
    if (fresh.some((e) => ACTION.includes(e.kind) || (e.kind === 'review' && /CHANGES_REQUESTED$/.test(e.line)))) process.exit(1);
    if (fresh.length && opts.until === 'any-change') process.exit(0);
    const met = opts.until === 'green' ? snap.green : opts.until === 'ready' && snap.ready;
    if (met) {
      const line = opts.until === 'green' ? 'checks-done pass' : 'ready';
      if (!fresh.some((e) => e.line === line)) say(line);
      process.exit(0);
    }

    const left = deadline - Date.now();
    if (left <= 0) process.exit(3);
    await pause(Math.min(opts.interval * 1000, left));
    if (Date.now() >= deadline) process.exit(3);
    const next = viewPr(opts);
    if (next.ok) {
      pr = next.data;
      misses = 0;
    } else {
      misses += 1;
      note(`poll failed: ${next.error}`);
      if (misses >= 5) die(`gh failed 5 polls in a row: ${next.error}`);
    }
  }
}

main().catch((err) => die(err.message));
