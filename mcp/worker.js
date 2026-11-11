// Runs one agent to completion, detached, so a reply still arrives if the agent
// that asked has exited. Usage: node worker.js <hub dir> <run id>
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { command, which } = require('./agents');
const hosts = require('./hosts');
const { nextId, withState } = require('./store');

const [dir, id] = process.argv.slice(2);
const MAX_REPLY = 20000;
const MAX_MESSAGE = 3500;
const stripAnsi = (text) => text.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');

function finish(fields) {
  withState(dir, (state) => {
    const run = state.runs[id];
    if (run.status === 'stopped') return;
    Object.assign(run, fields, { ended: Date.now() });
    const label = `${run.kind} run ${id} ${run.status}`;
    state.messages.push({
      id: nextId(state, 'm'), from: 'hub', to: run.from, at: Date.now(), readBy: [],
      text: `${label}:\n${(run.reply || run.error || '').slice(0, MAX_MESSAGE)}`,
    });
  });
}

function main() {
  const run = withState(dir, (state) => state.runs[id]);
  const runDir = path.join(dir, 'runs', id);
  const { args, replyFile } = command(run, path.join(runDir, 'reply.txt'));
  const file = which(run.kind);
  const script = /\.(cmd|bat)$/i.test(file);
  const quote = (a) => (/\s/.test(a) ? `"${a}"` : a);

  // The asking session's identity must not leak into the new agent: a child-session marker
  // turns off its transcript, and a session id or messaging pipe would point at the wrong session.
  const env = { ...process.env, DAMI_AGENT: `${run.kind}-${id}`, DAMI_RUN: id };
  const inherited = /^(CLAUDECODE|CLAUDE_PID|CLAUDE_CODE_(CHILD_SESSION|SESSION_|HOST_|MESSAGING_|ENTRYPOINT|TERMINAL_MCP_TOOLS|DESKTOP_)|CLAUDE_AGENT_SDK_)/;
  Object.keys(env).filter((key) => inherited.test(key)).forEach((key) => { delete env[key]; });
  const child = spawn(script ? quote(file) : file, script ? args.map(quote) : args, {
    cwd: run.cwd, env, shell: script, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  });
  withState(dir, (state) => { state.runs[id].pid = child.pid; });

  let out = '';
  let err = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { err += d; });
  child.stdin.on('error', () => {});
  child.stdin.end(fs.readFileSync(path.join(runDir, 'prompt.md'), 'utf8'));

  const kill = () => {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
    else child.kill('SIGKILL');
  };

  const timer = setTimeout(() => {
    kill();
    finish({ status: 'timed-out', error: `No reply within ${run.timeoutMinutes} minutes.` });
    process.exit(0);
  }, run.timeoutMinutes * 60000);

  // The worker owns the process, so it carries out stops. A stop can arrive before anyone else knows the pid.
  const stopWatch = setInterval(() => {
    if (withState(dir, (state) => state.runs[id].status) === 'stopped') {
      kill();
      process.exit(0);
    }
  }, 1000);

  const settle = () => {
    clearTimeout(timer);
    clearInterval(stopWatch);
  };

  child.on('error', (e) => {
    settle();
    finish({ status: 'failed', error: e.message });
  });
  child.on('close', (code) => {
    settle();
    const fromFile = replyFile && fs.existsSync(replyFile) ? fs.readFileSync(replyFile, 'utf8') : '';
    const reply = stripAnsi(fromFile || out).trim().slice(-MAX_REPLY);
    if (code === 0) finish({ status: 'done', reply });
    else finish({ status: 'failed', reply, error: `Exit ${code}: ${stripAnsi(err || out).trim().slice(-1500)}` });
  });
}

// The same run on another machine: send the code up, run there on a worktree, bring the
// branch back in write mode. The reply is the remote script's stdout.
function remote() {
  const run = withState(dir, (state) => state.runs[id]);
  const host = hosts.getHost(run.host);
  const runDir = path.join(dir, 'runs', id);
  const rid = run.remoteId;
  const baseRef = `dami/${rid}-base`;
  const branch = `dami/${rid}`;
  const sha = hosts.pushUp(host, run.localCwd, run.repo, baseRef);
  withState(dir, (state) => { state.runs[id].sent = sha; });

  const { args } = command({ ...run, cwd: '@CWD@' }, '@OUT@');
  const arg = (a) => (a === '@OUT@' ? '"$RUNDIR/reply.txt"' : a === '@CWD@' ? '"$WT"' : hosts.q(a));
  const child = hosts.spawnScript(host, hosts.runScriptFor(host, {
    repo: run.repo, id: rid, base: baseRef, branch, write: run.mode === 'write',
    agentLine: [run.kind, ...args].map(arg).join(' '),
    prompt: fs.readFileSync(path.join(runDir, 'prompt.md'), 'utf8'),
    timeoutMinutes: run.timeoutMinutes,
  }));
  withState(dir, (state) => { state.runs[id].pid = child.pid; });

  let out = '';
  let err = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { err += d; });

  const cleanup = (keepBranch) => hosts.cleanupRemote(host, { repo: run.repo, id: rid, baseRef, branch: keepBranch ? null : branch });
  const stopAll = () => {
    hosts.stopRemote(host, rid);
    child.kill();
    cleanup(false);
  };
  const timer = setTimeout(() => {
    stopAll();
    finish({ status: 'timed-out', error: `No reply within ${run.timeoutMinutes} minutes.` });
    process.exit(0);
  }, (run.timeoutMinutes + 2) * 60000);
  const stopWatch = setInterval(() => {
    if (withState(dir, (state) => state.runs[id].status) === 'stopped') {
      stopAll();
      process.exit(0);
    }
  }, 1000);

  child.on('error', (e) => {
    clearTimeout(timer);
    clearInterval(stopWatch);
    finish({ status: 'failed', error: e.message });
  });
  child.on('close', (code) => {
    clearTimeout(timer);
    clearInterval(stopWatch);
    const reply = stripAnsi(out).trim().slice(-MAX_REPLY);
    const fields = { reply };
    if (code === 0 && run.mode === 'write') {
      try {
        hosts.fetchBack(host, run.localCwd, run.repo, branch, run.branch);
        const ahead = spawnSync('git', ['-C', run.localCwd, 'rev-list', '--count', `${sha}..${run.branch}`], { encoding: 'utf8', windowsHide: true });
        fields.commits = Number((ahead.stdout || '0').trim()) || 0;
        if (!fields.commits) {
          spawnSync('git', ['-C', run.localCwd, 'branch', '-D', run.branch], { windowsHide: true });
          fields.branch = null;
        }
      } catch (e) {
        fields.error = e.message;
      }
    }
    cleanup(false);
    if (code === 0 && !fields.error) finish({ status: 'done', ...fields });
    else if (code === 124) finish({ status: 'timed-out', ...fields, error: `No reply within ${run.timeoutMinutes} minutes.` });
    else finish({ status: 'failed', ...fields, error: fields.error || `Exit ${code}: ${stripAnsi(err).trim().slice(-1500)}` });
  });
}

try {
  const { host } = withState(dir, (state) => state.runs[id]);
  if (host) remote();
  else main();
} catch (err) {
  finish({ status: 'failed', error: err.message });
}
