// Drives the real server over stdio, the way a client does. team_ask starts a
// stand-in agent CLI, so the whole path runs without calling a model.
const assert = require('node:assert');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const test = require('node:test');

const SERVER = path.join(__dirname, '..', 'bin', 'dami-mcp.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dami-hub-'));
const fakeAgent = path.join(tmp, 'fake-agent.js');
const fakeCli = path.join(tmp, process.platform === 'win32' ? 'fake-agent.cmd' : 'fake-agent');
fs.writeFileSync(fakeAgent, `
let input = '';
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', () => {
  if (input.includes('please crash')) { console.error('boom'); process.exit(3); }
  if (input.includes('please hang')) { setTimeout(() => {}, 60000); return; }
  console.log('fake reply to: ' + input.split('\\n').pop());
});`);
fs.writeFileSync(fakeCli, process.platform === 'win32' ? `@node "${fakeAgent}" %*\r\n` : `#!/bin/sh\nexec node "${fakeAgent}" "$@"\n`);
if (process.platform !== 'win32') fs.chmodSync(fakeCli, 0o755);

function connect(clientName, cwd = tmp, extraEnv = {}) {
  const child = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env, DAMI_HUB_DIR: path.join(tmp, 'hub'), DAMI_HUB_CWD: cwd, DAMI_AGENT: '', DAMI_CLI_CODEX: fakeCli,
      DAMI_HOSTS_FILE: path.join(tmp, 'hosts.json'), ...extraEnv,
    },
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const waiting = new Map();
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    const message = JSON.parse(line);
    waiting.get(message.id)(message);
  });
  let id = 0;
  const request = (method, params) => new Promise((resolve) => {
    id += 1;
    waiting.set(id, resolve);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  const call = async (name, args = {}) => {
    const { result } = await request('tools/call', { name, arguments: args });
    const text = result.content[0].text;
    return result.isError ? { error: text } : JSON.parse(text);
  };
  const ready = request('initialize', { protocolVersion: '2025-06-18', clientInfo: { name: clientName } });
  return { call, request, ready, close: () => child.stdin.end() };
}

// A stopped worker lets go of the folder within a couple of seconds.
test.after(() => fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 30, retryDelay: 200 }));

test('a client joins and receives the routing map', async () => {
  const a = connect('codex-mcp-client');
  const { result } = await a.ready;
  assert.strictEqual(result.serverInfo.name, 'dami');
  assert.match(result.instructions, /# dami stack/);
  assert.strictEqual((await a.request('tools/list')).result.tools.length, 10);
  a.close();
});

test('two agents exchange messages, and each reads a message once', async () => {
  const a = connect('claude-code');
  const b = connect('codex-mcp-client');
  await Promise.all([a.ready, b.ready]);

  await a.call('team_send', { to: 'codex', text: 'can you check auth?' });
  const first = await b.call('team_inbox');
  assert.strictEqual(first.messages.length, 1);
  assert.strictEqual(first.messages[0].text, 'can you check auth?');
  assert.match(first.messages[0].from, /^claude-/);
  assert.strictEqual((await b.call('team_inbox')).messages.length, 0);
  assert.strictEqual((await a.call('team_inbox')).messages.length, 0);

  const roster = await a.call('team_roster');
  assert.ok(roster.agents.some((x) => x.kind === 'codex'));
  a.close();
  b.close();
});

test('team_ask starts an agent and returns its reply, and to the inbox as well', async () => {
  const a = connect('claude-code');
  await a.ready;
  const run = await a.call('team_ask', { to: 'codex', message: 'what is 2 + 2?', wait_seconds: 20 });
  assert.strictEqual(run.status, 'done');
  assert.match(run.reply, /fake reply to: what is 2 \+ 2\?/);
  const { messages } = await a.call('team_inbox');
  assert.ok(messages.some((m) => m.from === 'hub' && m.text.includes('fake reply')));
  a.close();
});

test('team_run can wait for a run that is still going', async () => {
  const a = connect('claude-code');
  await a.ready;
  const started = await a.call('team_ask', { to: 'codex', message: 'slow but fine' });
  assert.strictEqual(started.status, 'running');
  const finished = await a.call('team_run', { id: started.id, wait_seconds: 20 });
  assert.strictEqual(finished.status, 'done');
  assert.match(finished.reply, /slow but fine/);
  a.close();
});

test('a crashing agent reports failure with its error', async () => {
  const a = connect('claude-code');
  await a.ready;
  const run = await a.call('team_ask', { to: 'codex', message: 'please crash', wait_seconds: 20 });
  assert.strictEqual(run.status, 'failed');
  assert.match(run.error, /boom/);
  a.close();
});

test('a run can be stopped, and active runs are capped', async () => {
  const a = connect('claude-code');
  await a.ready;
  const runs = [];
  for (let i = 0; i < 3; i += 1) runs.push(await a.call('team_ask', { to: 'codex', message: 'please hang' }));
  const refused = await a.call('team_ask', { to: 'codex', message: 'one too many' });
  assert.match(refused.error, /3 runs are active/);
  for (const r of runs) assert.strictEqual((await a.call('team_run', { id: r.id, stop: true })).status, 'stopped');
  a.close();
});

test('an unknown or missing agent kind is refused', async () => {
  const a = connect('claude-code');
  await a.ready;
  assert.match((await a.call('team_ask', { to: 'gemini', message: 'x' })).error, /must be one of/);
  a.close();
});

test('a task waits for its blockers, and only one agent can claim it', async () => {
  const a = connect('claude-code');
  const b = connect('opencode');
  await Promise.all([a.ready, b.ready]);
  const first = await a.call('board', { action: 'add', title: 'schema' });
  const second = await a.call('board', { action: 'add', title: 'api', needs: [first.id] });

  assert.match((await b.call('board', { action: 'claim', id: second.id })).error, /waiting on/);
  assert.strictEqual((await b.call('board', { action: 'claim', id: first.id })).status, 'claimed');
  assert.match((await a.call('board', { action: 'claim', id: first.id })).error, /held by opencode/);
  await b.call('board', { action: 'update', id: first.id, status: 'done' });
  assert.strictEqual((await b.call('board', { action: 'claim', id: second.id })).status, 'claimed');
  a.close();
  b.close();
});

test('leases block overlapping paths until released', async () => {
  const a = connect('claude-code');
  const b = connect('codex-mcp-client');
  await Promise.all([a.ready, b.ready]);
  await a.call('lease', { action: 'acquire', paths: ['src/auth/**'] });
  assert.match((await b.call('lease', { action: 'acquire', paths: ['src/auth/login.js'] })).error, /held by claude/);
  await a.call('lease', { action: 'release' });
  assert.ok(!(await b.call('lease', { action: 'acquire', paths: ['src/auth/login.js'] })).error);
  await b.call('lease', { action: 'release' });
  a.close();
  b.close();
});

test('notes are found by the file they are pinned to', async () => {
  const a = connect('claude-code');
  await a.ready;
  await a.call('note', { action: 'add', text: 'this retry hides a race', paths: ['src/queue.js'] });
  assert.strictEqual((await a.call('note', { action: 'list', path: 'src/queue.js' })).notes.length, 1);
  assert.strictEqual((await a.call('note', { action: 'list', path: 'src/other.js' })).notes.length, 0);
  a.close();
});

test('skills are listed and read, and cannot escape their folder', async () => {
  const a = connect('codex-mcp-client');
  await a.ready;
  assert.strictEqual((await a.call('skills')).skills.length, 21);
  assert.match((await a.call('skills', { name: 'finish-line' })).text, /# Finish line/i);
  assert.match((await a.call('skills', { name: 'finish-line', file: '../../../package.json' })).error, /outside the skill/);
  a.close();
});

test('commands are prompts for other clients, and not for Claude Code', async () => {
  const codex = connect('codex-mcp-client');
  const claude = connect('claude-code');
  await Promise.all([codex.ready, claude.ready]);
  assert.strictEqual((await codex.request('prompts/list')).result.prompts.length, 14);
  assert.strictEqual((await claude.request('prompts/list')).result.prompts.length, 0);
  const prompt = await codex.request('prompts/get', { name: 'fix', arguments: { focus: 'the flaky export' } });
  assert.match(prompt.result.messages[0].content.text, /the flaky export/);
  codex.close();
  claude.close();
});

// A stand-in for ssh: runs the remote command in bash with HOME set to a folder that plays
// the remote machine, and a stand-in claude there. Code really travels with git both ways.
function bashPath() {
  if (process.platform !== 'win32') return '/bin/bash';
  const r = spawnSync('git', ['--exec-path'], { encoding: 'utf8' });
  const file = r.status === 0 && path.resolve(r.stdout.trim(), '../../..', 'bin', 'bash.exe');
  return file && fs.existsSync(file) ? file : null;
}

// Only git and the basic tools, so the remote side finds no agent CLIs of this machine.
function barePath() {
  if (process.platform !== 'win32') return '/usr/bin:/bin';
  const gitRoot = path.resolve(path.dirname(bashPath()), '..');
  return [path.join(gitRoot, 'usr', 'bin'), path.join(gitRoot, 'cmd')].join(';');
}

test('team_ask runs on a remote host: code goes up, and a write run comes back as a branch', { skip: !bashPath() && 'no bash' }, async (t) => {
  const remoteHome = path.join(tmp, 'remote-home');
  fs.mkdirSync(path.join(remoteHome, '.local', 'bin'), { recursive: true });
  const remoteClaude = path.join(remoteHome, '.local', 'bin', 'claude');
  fs.writeFileSync(remoteClaude, '#!/bin/sh\ninput=$(cat)\ncase "$input" in *"write a file"*) echo hi > remote.txt;; esac\necho "remote reply, sees local.txt: $(cat local.txt)"\n');
  fs.chmodSync(remoteClaude, 0o755);
  const fakeSsh = path.join(tmp, 'fake-ssh.js');
  fs.writeFileSync(fakeSsh, `
const { spawnSync } = require('child_process');
const args = process.argv.slice(2);
let i = 0;
while (args[i] && args[i].startsWith('-')) i += args[i] === '-T' ? 1 : 2;
const r = spawnSync(${JSON.stringify(bashPath())}, ['-c', args.slice(i + 1).join(' ')], {
  stdio: 'inherit', cwd: ${JSON.stringify(remoteHome)},
  env: { ...process.env, HOME: ${JSON.stringify(remoteHome)}, PATH: ${JSON.stringify(barePath())} },
});
process.exit(r.status === null ? 1 : r.status);`);

  const repo = path.join(tmp, 'local-repo');
  fs.mkdirSync(repo);
  const git = (...a) => spawnSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' });
  git('init', '-q');
  fs.writeFileSync(path.join(repo, 'README.md'), 'hello\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'first');
  fs.writeFileSync(path.join(repo, 'local.txt'), 'not committed yet');

  const a = connect('claude-code', repo, { DAMI_SSH: fakeSsh });
  t.after(() => a.close());
  await a.ready;
  const added = await a.call('team_host', { action: 'add', name: 'box', ssh: 'box' });
  assert.deepStrictEqual(added.kinds, ['claude'], added.error);

  const read = await a.call('team_ask', { to: 'claude', host: 'box', message: 'look around', wait_seconds: 40 });
  assert.strictEqual(read.status, 'done', read.error);
  assert.match(read.reply, /sees local.txt: not committed yet/);
  assert.strictEqual(read.branch, null);

  const write = await a.call('team_ask', { to: 'claude', host: 'box', mode: 'write', message: 'write a file', wait_seconds: 40 });
  assert.strictEqual(write.status, 'done', write.error);
  assert.strictEqual(write.commits, 1);
  assert.strictEqual(git('show', `${write.branch}:remote.txt`).stdout.trim(), 'hi');
  assert.strictEqual(git('status', '--short').stdout.trim(), '?? local.txt');
  assert.match((await a.call('team_ask', { to: 'codex', host: 'box', message: 'x' })).error, /was not on box/);
});

test('parallel writers lose nothing', async () => {
  const clients = [connect('claude-code'), connect('codex-mcp-client'), connect('opencode')];
  await Promise.all(clients.map((c) => c.ready));
  await Promise.all(clients.flatMap((c, i) => Array.from({ length: 10 }, (_, n) => c.call('board', { action: 'add', title: `load-${i}-${n}` }))));
  const { tasks } = await clients[0].call('board', { action: 'list' });
  assert.strictEqual(tasks.filter((t) => t.title.startsWith('load-')).length, 30);
  clients.forEach((c) => c.close());
});
