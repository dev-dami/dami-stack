// Fixed library for walk-me-through scripts. Authored stages live in a separate file that requires this one.
// Node built-ins only, so it runs under cmd.exe, PowerShell, macOS, Linux and WSL.
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { Writable } = require('stream');

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (text) => (color ? `\x1b[${code}m${text}\x1b[0m` : text);
const bold = paint('1');
const dim = paint('2');
const yellow = paint('33');

// One readline for the whole walk. Hidden input mutes its echo.
// Lines go through a queue so piped answers aren't lost between prompts.
let muted = false;
let waiter = null;
const queue = [];
const echo = new Writable({
  write(chunk, encoding, done) {
    if (!muted) process.stdout.write(chunk, encoding);
    done();
  },
});
const rl = readline.createInterface({ input: process.stdin, output: echo, terminal: Boolean(process.stdin.isTTY) });
rl.on('line', (text) => {
  if (!waiter) { queue.push(text); return; }
  const take = waiter;
  waiter = null;
  take(text);
});
rl.on('SIGINT', () => {
  muted = false;
  console.log('\n\nStopped. Run the script again: remembered values are kept.');
  process.exit(130);
});
rl.on('close', () => {
  if (!waiter) return;
  console.log('\nInput ended before this question was answered. Run the script again in a terminal.');
  process.exit(1);
});

function prompt(text, hidden = false) {
  return new Promise((resolve) => {
    rl.setPrompt(text);
    muted = false;
    if (process.stdin.isTTY) rl.prompt();
    else process.stdout.write(text);
    muted = hidden;
    const take = (answer) => {
      muted = false;
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    };
    if (queue.length) take(queue.shift());
    else waiter = take;
  });
}

function isWsl() {
  return process.platform === 'linux' && (Boolean(process.env.WSL_DISTRO_NAME) || /microsoft/i.test(os.release()));
}

function browserCommand(url) {
  if (process.platform === 'win32' || isWsl()) return ['rundll32.exe', ['url.dll,FileProtocolHandler', url]];
  if (process.platform === 'darwin') return ['open', [url]];
  return ['xdg-open', [url]];
}

function loadState(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function saveState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2), { mode: 0o600 });
}

function envLine(key, value) {
  const safe = /^[\w@%+=:,./-]*$/.test(value);
  return `${key}=${safe ? value : `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`}`;
}

function readEnvValue(file, key) {
  if (!fs.existsSync(file)) return '';
  const match = new RegExp(`^${key}=(.*)$`, 'm').exec(fs.readFileSync(file, 'utf8').replace(/\r/g, ''));
  if (!match) return '';
  const value = match[1];
  return value.startsWith('"') ? value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\') : value;
}

// Sets one key and leaves every other line alone. Mode 0600 applies on creation; Windows ignores it.
function writeEnv(file, key, value) {
  const line = envLine(key, value);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    fs.writeFileSync(file, `${line}\n`, { mode: 0o600 });
    return;
  }
  const text = fs.readFileSync(file, 'utf8');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const pattern = new RegExp(`^${key}=[^\\r\\n]*`, 'm');
  if (pattern.test(text)) fs.writeFileSync(file, text.replace(pattern, () => line));
  else fs.writeFileSync(file, `${text}${text === '' || text.endsWith('\n') ? '' : eol}${line}${eol}`);
}

// Exit status 1 means git looked and the file isn't ignored. Outside a repo there is nothing to warn about.
function gitIgnores(file) {
  return spawnSync('git', ['check-ignore', '-q', file], { windowsHide: true }).status !== 1;
}

const CI_HOSTS = {
  github: { cli: 'gh', ready: ['auth', 'status'], set: (name) => ['secret', 'set', name] },
  gitlab: { cli: 'glab', ready: ['auth', 'status'], set: (name) => ['variable', 'set', name, '--masked'] },
};

function makeWalker(state, stateFile, log) {
  const remember = (name, value) => {
    state[name] = value;
    saveState(stateFile, state);
  };
  const w = {
    say(text) { console.log(text); },
    todo(text) {
      log.todos.push(text);
      console.log(yellow(`Left for later: ${text}`));
    },

    // Opens a page. The address is always printed too, in case no browser starts.
    open(url) {
      console.log(`Opening ${url}`);
      const [file, args] = browserCommand(url);
      const child = spawn(file, args, { detached: true, stdio: 'ignore', windowsHide: true });
      child.on('error', () => console.log(dim('Could not start a browser. Open the address yourself.')));
      child.unref();
    },

    // Visible input. The answer is remembered and offered on the next run.
    async ask(name, question) {
      const saved = state[name];
      const hint = saved ? dim(` [${saved}]`) : '';
      const answer = (await prompt(`${question}${hint}: `)) || saved || '';
      remember(name, answer);
      log.values.push(name);
      return answer;
    },

    // Hidden input. Never stored by this library: pass envFile to reuse a value already written there.
    async secret(name, question, { envFile } = {}) {
      const saved = envFile ? readEnvValue(envFile, name) : '';
      const hint = saved ? dim(' [Enter keeps the saved value]') : '';
      const answer = (await prompt(`${question}${hint}: `, true)) || saved;
      log.values.push(`${name} (hidden)`);
      return answer;
    },

    env(file, key, value) {
      writeEnv(file, key, value);
      log.envWrites.push(`${key} in ${file}`);
      if (!gitIgnores(file)) w.todo(`${file} is not ignored by git. Ignore it before committing.`);
    },

    // The value goes over stdin, never on a command line. A CLI that isn't ready leaves a to-do.
    ciSecret(name, value, { host = 'github' } = {}) {
      const ci = CI_HOSTS[host];
      const ready = ci && spawnSync(ci.cli, ci.ready, { windowsHide: true, stdio: 'ignore' }).status === 0;
      const written = ready && spawnSync(ci.cli, ci.set(name), {
        input: value, windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'],
      }).status === 0;
      if (written) log.ciWrites.push(name);
      else w.todo(`Set the CI secret ${name} by hand on ${host}: its CLI wasn't ready.`);
      return Boolean(written);
    },

    async pause(text = 'Press Enter when that is done.') {
      await prompt(`${text} `);
    },

    async yesNo(question) {
      return /^y(es)?$/i.test(await prompt(`${question} (y/N) `));
    },

    // The two actions a human-driven signal may use. Answers print as key=value for the agent to read.
    async showAndWait(text) {
      console.log(text);
      await w.pause();
    },
    async askAndRecord(name, question) {
      const answer = await prompt(`${question}: `);
      log.records.push(`${name}=${answer}`);
      return answer;
    },
  };
  return w;
}

function summary(title, log, finished, total) {
  console.log(`\n${bold(`${title}: ${finished} of ${total} stages finished`)}`);
  const list = (heading, items) => {
    if (!items.length) return;
    console.log(`\n${heading}`);
    items.forEach((item) => console.log(`  ${item}`));
  };
  list('Values collected', log.values);
  list('Env values written', log.envWrites);
  list('CI secrets written', log.ciWrites);
  list('Recorded answers', log.records);
  list('Still to do by hand', log.todos);
  console.log('');
}

// Runs { title, stages: [{ name, run(w) }] }, one screen per stage.
async function walk({ title, stages }) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const stateFile = path.join(os.homedir(), '.dami', 'walks', `${slug}.json`);
  const log = { values: [], envWrites: [], ciWrites: [], records: [], todos: [] };
  const w = makeWalker(loadState(stateFile), stateFile, log);
  let finished = 0;

  for (const [index, stage] of stages.entries()) {
    if (process.stdout.isTTY) console.clear();
    const step = index + 1;
    const bar = `[${'#'.repeat(step)}${'-'.repeat(stages.length - step)}]`;
    console.log(`${dim(title)}\n${bold(`Stage ${step} of ${stages.length}: ${stage.name}`)} ${dim(bar)}\n`);
    try {
      await stage.run(w);
      finished += 1;
    } catch (err) {
      log.todos.push(`Stage "${stage.name}" stopped: ${err.message}`);
      break;
    }
  }
  summary(title, log, finished, stages.length);
  rl.removeAllListeners('close');
  rl.close();
  process.exitCode = finished === stages.length ? 0 : 1;
}

module.exports = { walk };
