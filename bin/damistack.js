#!/usr/bin/env node
// Opens Claude Code with dami stack, inside Herdr when it is installed.
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const pkg = require('../package.json');
const plugin = require('../.claude-plugin/plugin.json');

// Uses your normal Herdr session unless told otherwise.
const SESSION = process.env.DAMISTACK_SESSION ? ['--session', process.env.DAMISTACK_SESSION] : [];
const STACK = path.resolve(__dirname, '..');
const SETTINGS_FILE = path.join(os.tmpdir(), 'dami-stack-settings.json');

const color = (process.stdout.isTTY || Boolean(process.env.FORCE_COLOR)) && !process.env.NO_COLOR;
const paint = (code) => (text) => (color ? `\x1b[${code}m${text}\x1b[0m` : text);
const accent = paint('38;5;209');
const dim = paint('2');
const green = paint('32');
const red = paint('31');
const yellow = paint('33');
const bold = paint('1');

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const tilde = (p) => (p.startsWith(os.homedir()) ? `~${p.slice(os.homedir().length)}` : p);
const quoted = (p) => (/\s/.test(p) ? `"${p}"` : p);

function row(mark, label, detail = '') {
  console.log(`  ${mark} ${label.padEnd(13)}${dim(detail)}`);
}
const ok = (label, detail) => row(green('✓'), label, detail);
const warn = (label, detail) => row(yellow('!'), label, detail);
const fail = (label, detail) => row(red('✗'), label, detail);

function banner() {
  console.log(`\n  ${accent(bold('dami stack'))} ${dim(`v${pkg.version}`)}\n`);
}

// Finds a command on PATH. npm-installed tools on Windows are .cmd files, which need a shell.
function which(name) {
  const exts = process.platform === 'win32' ? (process.env.PATHEXT || '.EXE;.CMD').split(';') : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    for (const ext of exts) {
      const file = path.join(dir, name + ext);
      if (dir && fs.existsSync(file)) return file;
    }
  }
  return null;
}

function run(name, args, options = {}) {
  const file = which(name) || name;
  const script = /\.(cmd|bat)$/i.test(file);
  return spawnSync(script ? quoted(file) : file, script ? args.map(quoted) : args, {
    windowsHide: true, shell: script, ...options,
  });
}

function herdr(...args) {
  const r = run('herdr', [...SESSION, ...args], { encoding: 'utf8' });
  const parse = (text) => { try { return JSON.parse(text); } catch { return {}; } };
  return {
    ok: r.status === 0,
    result: parse(r.stdout || '').result,
    error: parse(r.stderr || '').error || parse(r.stdout || '').error,
    raw: `${r.stdout || ''}${r.stderr || ''}`.trim(),
  };
}

function writeSettings() {
  const script = path.join(STACK, 'bin', 'statusline.js');
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ statusLine: { type: 'command', command: `node "${script}"` } }));
}

// True once dami is a regular plugin. Loading it again by path would shadow that install.
function pluginInstalled() {
  try {
    const file = path.join(os.homedir(), '.claude', 'settings.json');
    return JSON.parse(fs.readFileSync(file, 'utf8')).enabledPlugins['dami@dami-stack'] === true;
  } catch {
    return false;
  }
}

function claudeArgs(cwd) {
  return [
    ...(pluginInstalled() ? [] : ['--plugin-dir', STACK]),
    '--settings', SETTINGS_FILE,
    '--name', `dami: ${path.basename(cwd) || cwd}`,
  ];
}

function ensureServer() {
  if (herdr('workspace', 'list').ok) return;
  spawn(which('herdr'), [...SESSION, 'server'], {
    detached: true, stdio: 'ignore', windowsHide: true,
  }).unref();
  for (let i = 0; i < 50; i += 1) {
    sleep(200);
    if (herdr('workspace', 'list').ok) return;
  }
  throw new Error('Herdr did not start. Run `herdr status` to see why.');
}

function startClaude(paneId, cwd) {
  const name = `dami-${paneId.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
  const start = () => herdr('agent', 'start', name, '--kind', 'claude', '--pane', paneId, '--timeout', '60000', '--', ...claudeArgs(cwd));
  const code = (r) => r.error && r.error.code;

  let r = start();
  // A new pane reports busy until its shell reaches the prompt, which can take seconds.
  for (let i = 0; code(r) === 'agent_pane_busy' && i < 60; i += 1) {
    sleep(500);
    r = start();
  }
  // Blocked means Claude is showing a prompt, such as trusting a new folder. The user answers it.
  return r.ok || ['agent_not_ready', 'timeout'].includes(code(r)) ? null : r.raw;
}

function openInHerdr(cwd) {
  const agents = (herdr('agent', 'list').result || {}).agents || [];
  const running = agents.find((a) => a.agent === 'claude' && a.cwd && samePath(a.cwd, cwd));
  if (running) {
    herdr('workspace', 'focus', running.workspace_id);
    ok('Session', `back to ${path.basename(cwd)}`);
    return;
  }

  const created = herdr('workspace', 'create', '--cwd', cwd, '--label', path.basename(cwd) || cwd, '--focus');
  const pane = created.result && created.result.root_pane;
  if (!pane) throw new Error(`Could not create a Herdr workspace: ${created.raw}`);
  const failure = startClaude(pane.pane_id, cwd);
  if (failure) throw new Error(`Could not start Claude Code: ${failure}`);
  ok('Session', `started in ${path.basename(cwd)}`);
}

function open(target) {
  const cwd = path.resolve(target || process.cwd());
  if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error(`No such folder: ${cwd}`);
  if (!which('claude')) throw new Error('Claude Code is not installed. Get it at https://claude.com/claude-code');

  banner();
  writeSettings();

  if (process.env.HERDR_ENV === '1') {
    return run('claude', claudeArgs(cwd), { stdio: 'inherit', cwd }).status || 0;
  }
  if (!which('herdr')) {
    warn('Herdr', 'not installed, running here. Get it at https://herdr.dev');
    console.log('');
    return run('claude', claudeArgs(cwd), { stdio: 'inherit', cwd }).status || 0;
  }

  console.log(`  ${dim('Opening...')}`);
  ensureServer();
  openInHerdr(cwd);
  return run('herdr', SESSION, { stdio: 'inherit' }).status || 0;
}

function status() {
  banner();
  const version = which('claude') ? run('claude', ['--version'], { encoding: 'utf8' }).stdout : null;
  if (version) ok('Claude Code', version.trim());
  else fail('Claude Code', 'not installed, get it at https://claude.com/claude-code');

  if (!which('herdr')) {
    warn('Herdr', 'not installed, Claude Code runs without workspaces');
  } else {
    const r = herdr('agent', 'list');
    if (!r.ok) {
      ok('Herdr', 'installed, not running');
    } else {
      ok('Herdr', 'running');
      (r.result.agents || []).forEach((a) => console.log(`    ${dim(`${a.agent_status.padEnd(9)}${tilde(a.cwd || '')}`)}`));
    }
  }

  // These decide which agent kinds a run can start.
  [['Codex', 'codex'], ['OpenCode', 'opencode']].forEach(([label, name]) => {
    if (which(name)) ok(label, 'installed');
    else warn(label, 'not installed');
  });
  if (which('deck')) ok('Deck', 'installed, optional');
  console.log('');
  return 0;
}

function hubEntry() {
  return { command: process.execPath, args: [path.join(STACK, 'bin', 'dami-mcp.js')] };
}

// Headless Codex runs refuse MCP calls that need approval, so the hub's tools are pre-approved.
// Gates still apply: they live in the skills, not in Codex's approval prompt.
function approveHubInCodex() {
  const file = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'config.toml');
  const text = fs.readFileSync(file, 'utf8');
  const start = text.search(/^\[mcp_servers\.dami\]\s*$/m);
  if (start < 0) return false;
  const rest = text.slice(start + 1);
  const next = rest.search(/^\[/m);
  const end = next < 0 ? text.length : start + 1 + next;
  if (/^default_tools_approval_mode\s*=/m.test(text.slice(start, end))) return true;
  const block = text.slice(start, end).replace(/\s*$/, '\ndefault_tools_approval_mode = "approve"\n\n');
  fs.writeFileSync(file, text.slice(0, start) + block + text.slice(end));
  return true;
}

function registerCodex() {
  if (!which('codex')) return ['Codex', null, 'not installed'];
  const known = run('codex', ['mcp', 'get', 'dami'], { encoding: 'utf8' }).status === 0;
  if (!known) {
    const { command, args } = hubEntry();
    const added = run('codex', ['mcp', 'add', 'dami', '--', command, ...args], { encoding: 'utf8' });
    if (added.status !== 0) return ['Codex', false, `failed: ${added.stderr}`.trim()];
  }
  if (!approveHubInCodex()) return ['Codex', false, 'registered, but could not pre-approve the hub tools'];
  return ['Codex', true, known ? 'already registered, hub tools approved' : 'registered, hub tools approved'];
}

// One new key goes into OpenCode's config, and nothing else in it changes.
function registerOpenCode() {
  const file = path.join(os.homedir(), '.config', 'opencode', 'opencode.json');
  if (!fs.existsSync(file)) return ['OpenCode', null, 'no config file'];
  let config;
  try {
    config = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return ['OpenCode', false, 'config is not plain JSON, add the entry from `damistack mcp` by hand'];
  }
  config.mcp = config.mcp || {};
  const servers = config.mcp.servers || config.mcp;
  if (servers.dami) return ['OpenCode', true, 'already registered'];
  const { command, args } = hubEntry();
  servers.dami = { type: 'local', command: [command, ...args] };
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  return ['OpenCode', true, 'registered'];
}

function registerHub() {
  [registerCodex(), registerOpenCode()].forEach(([label, state, detail]) => {
    if (state === true) ok(label, detail);
    else if (state === false) fail(label, detail);
    else warn(label, detail);
  });
}

// Settings for any other MCP client.
function mcp() {
  console.log(JSON.stringify({ mcpServers: { dami: hubEntry() } }, null, 2));
  return 0;
}

// What the hub knows about this repo.
function team() {
  banner();
  const { hubDir, withState } = require('../mcp/store');
  const state = withState(hubDir(process.cwd()), (s) => s);
  const recent = Date.now() - 10 * 60000;
  const agents = Object.entries(state.agents).filter(([, a]) => !a.left && a.seen > recent);
  const runs = Object.entries(state.runs).slice(-8);
  const leases = state.leases.filter((l) => l.until > Date.now());
  const section = (title, lines, empty) => {
    console.log(`  ${bold(title)}`);
    (lines.length ? lines : [dim(empty)]).forEach((line) => console.log(`    ${line}`));
    console.log('');
  };
  section('Agents', agents.map(([name]) => name), 'none connected');
  section('Runs', runs.map(([id, r]) => `${id.padEnd(6)}${r.kind.padEnd(10)}${r.status.padEnd(11)}${dim(`from ${r.from}`)}`), 'none yet');
  section('Board', state.tasks.map((t) => `${t.id.padEnd(6)}${t.status.padEnd(9)}${t.title}${t.owner ? dim(`  ${t.owner}`) : ''}`), 'empty');
  section('Claimed files', leases.map((l) => `${l.path}${dim(`  ${l.owner}`)}`), 'none');
  return 0;
}

// True when dest already resolves to target. A broken link can't be shown to be ours, so it isn't.
function linksTo(dest, target) {
  try {
    return samePath(fs.realpathSync(dest), fs.realpathSync(target));
  } catch {
    return false;
  }
}

// lstat, because a broken link still occupies the name and must not be replaced.
function occupied(file) {
  try {
    fs.lstatSync(file);
    return true;
  } catch {
    return false;
  }
}

// Points ~/.agents/skills/<skill> at each skill folder. Junctions need no admin rights on Windows.
function link() {
  banner();
  const root = path.join(os.homedir(), '.agents', 'skills');
  fs.mkdirSync(root, { recursive: true });

  let skipped = 0;
  plugin.skills.forEach((entry) => {
    const target = path.resolve(STACK, entry);
    const name = path.basename(target);
    const dest = path.join(root, name);
    const label = name.padEnd(22);
    if (linksTo(dest, target)) {
      ok(label, 'already linked');
    } else if (occupied(dest)) {
      warn(label, 'skipped, something else is already there');
      skipped += 1;
    } else {
      fs.symlinkSync(target, dest, 'junction');
      ok(label, 'linked');
    }
  });

  console.log(`\n  ${dim(`${plugin.skills.length - skipped} of ${plugin.skills.length} skills in ${tilde(root)}`)}\n`);
  registerHub();
  console.log('');
  return 0;
}

function help() {
  banner();
  console.log(`  ${bold('Usage')}
    damistack              Open dami stack in this folder
    damistack <folder>     Open dami stack in that folder
    damistack status       Check Claude Code, Herdr, Codex and OpenCode
    damistack team         See this repo's agents, runs, board and claimed files
    damistack link         Share the skills and hub with Codex and OpenCode
    damistack mcp          Print hub settings for any other MCP client
    damistack help         Show this help
    damistack --version    Show the version
`);
  return 0;
}

const version = () => { console.log(pkg.version); return 0; };
const commands = {
  help,
  '--help': help,
  '-h': help,
  status,
  link,
  mcp,
  team,
  version,
  '--version': version,
  '-v': version,
};

try {
  const arg = process.argv[2];
  process.exitCode = (Object.hasOwn(commands, arg || '') ? commands[arg]() : open(arg));
} catch (err) {
  console.error(`\n  ${red('✗')} ${err.message}\n`);
  process.exitCode = 1;
}
