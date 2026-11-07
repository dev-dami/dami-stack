// Runs one agent to completion, detached, so a reply still arrives if the agent
// that asked has exited. Usage: node worker.js <hub dir> <run id>
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { command, which } = require('./agents');
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

  const env = { ...process.env, DAMI_AGENT: `${run.kind}-${id}`, DAMI_RUN: id };
  delete env.CLAUDECODE;
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

try {
  main();
} catch (err) {
  finish({ status: 'failed', error: err.message });
}
