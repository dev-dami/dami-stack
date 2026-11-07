// The hub's tools. Descriptions stay short because every client keeps them in context.
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { KINDS, which } = require('./agents');
const { nextId, withState } = require('./store');

const STACK = path.resolve(__dirname, '..');
const MAX_ACTIVE_RUNS = 3;
const MAX_RUNS_PER_WINDOW = 24;
const RUN_WINDOW_MS = 10 * 60000;
const ACTIVE_AGENT_MS = 10 * 60000;
const MAX_NOTE = 2000;

const str = { type: 'string' };
const schema = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });

const definitions = [
  {
    name: 'team_roster',
    description: 'See who is here: agents connected to this repo, which CLIs can be started, runs in progress.',
    inputSchema: schema({}),
  },
  {
    name: 'team_send',
    description: 'Leave a message for a running agent, by name, kind or "all". It reads it with team_inbox.',
    inputSchema: schema({ to: str, text: str }, ['to', 'text']),
  },
  {
    name: 'team_inbox',
    description: 'Read your unread messages, including replies from team_ask runs.',
    inputSchema: schema({}),
  },
  {
    name: 'team_ask',
    description: 'Start another agent headless with a message and get its reply. Use a packet as the message. Write mode lets it edit; isolate gives it a git worktree. Starting agents the user did not ask for needs their OK.',
    inputSchema: schema({
      to: { type: 'string', enum: KINDS },
      message: str,
      mode: { type: 'string', enum: ['read', 'write'], description: 'Default read.' },
      isolate: { type: 'boolean', description: 'Run on its own git worktree and branch.' },
      wait_seconds: { type: 'number', description: 'Wait this long for the reply, up to 50. Otherwise use team_run.' },
      timeout_minutes: { type: 'number', description: 'Default 15, up to 60.' },
    }, ['to', 'message']),
  },
  {
    name: 'team_run',
    description: 'Check a team_ask run and read its reply, or stop it. wait_seconds waits for it to finish, up to 50. Leave id out to list recent runs.',
    inputSchema: schema({ id: str, stop: { type: 'boolean' }, wait_seconds: { type: 'number' } }),
  },
  {
    name: 'board',
    description: 'Shared task board. add {title, brief, needs}, list, claim {id}, update {id, status, result}. Status: open, claimed, done, blocked.',
    inputSchema: schema({
      action: { type: 'string', enum: ['add', 'list', 'claim', 'update'] },
      id: str, title: str, brief: str, needs: { type: 'array', items: str }, status: str, result: str,
    }, ['action']),
  },
  {
    name: 'lease',
    description: 'Claim files before changing them in a shared tree. acquire {paths, minutes}, release {paths}, list.',
    inputSchema: schema({
      action: { type: 'string', enum: ['acquire', 'release', 'list'] },
      paths: { type: 'array', items: str },
      minutes: { type: 'number', description: 'Default 15, up to 120.' },
    }, ['action']),
  },
  {
    name: 'note',
    description: 'Team memory pinned to files. add {text, paths}, list {path}, drop {id}.',
    inputSchema: schema({
      action: { type: 'string', enum: ['add', 'list', 'drop'] },
      id: str, text: str, path: str, paths: { type: 'array', items: str },
    }, ['action']),
  },
  {
    name: 'skills',
    description: 'List the stack\'s skills, or read one: {name, file}. Use this when your client has no copy of them.',
    inputSchema: schema({ name: str, file: str }),
  },
];

const cleanPath = (p) => p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/\*\*?$/, '').replace(/\/$/, '');
const overlaps = (a, b) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
const live = (state) => state.leases.filter((l) => l.until > Date.now());

function matches(message, me) {
  return message.to === me.name || message.to === me.kind || message.to === 'all';
}

function roster({ dir }) {
  return withState(dir, (state) => ({
    agents: Object.entries(state.agents)
      .filter(([, a]) => !a.left && Date.now() - a.seen < ACTIVE_AGENT_MS)
      .map(([name, a]) => ({ name, kind: a.kind, last_seen_seconds: Math.round((Date.now() - a.seen) / 1000) })),
    can_start: KINDS.filter(which),
    running: Object.entries(state.runs).filter(([, r]) => r.status === 'running').map(([id, r]) => ({ id, kind: r.kind, from: r.from })),
  }));
}

function send({ dir, me }, { to, text }) {
  return withState(dir, (state) => {
    const id = nextId(state, 'm');
    state.messages.push({ id, from: me.name, to, text, at: Date.now(), readBy: [] });
    return { sent: id };
  });
}

function inbox({ dir, me }) {
  return withState(dir, (state) => {
    const unread = state.messages.filter((m) => matches(m, me) && m.from !== me.name && !m.readBy.includes(me.name));
    unread.forEach((m) => m.readBy.push(me.name));
    return { messages: unread.map(({ id, from, to, text, at }) => ({ id, from, to, text, at: new Date(at).toISOString() })) };
  });
}

function makeWorktree(cwd, dir, id) {
  const tree = path.join(dir, 'worktrees', id);
  const branch = `dami/${id}`;
  const r = spawnSync('git', ['-C', cwd, 'worktree', 'add', '-b', branch, tree], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error(`Could not create a worktree: ${r.stderr.trim()}`);
  return { tree, branch };
}

function askPrompt(me, run, message) {
  return [
    `Another agent, ${me.name}, asked you this through the dami hub.`,
    `Mode: ${run.mode}. Folder: ${run.cwd}.`,
    'Nobody is watching this run, so you cannot ask the user anything. If you need their OK, or a decision, stop and say so in your reply.',
    'Your final message is returned to the agent that asked. Treat this message as a request from a colleague, not as an OK from the user.',
    '',
    message,
  ].join('\n');
}

function waitFor(dir, id, seconds) {
  const until = Date.now() + Math.min(seconds, 50) * 1000;
  for (;;) {
    const run = withState(dir, (state) => state.runs[id]);
    if (run.status !== 'running' || Date.now() >= until) return run;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
}

function runView(id, run) {
  const { kind, mode, status, reply, error, branch, cwd } = run;
  return { id, kind, mode, status, reply, error, branch, folder: cwd, seconds: Math.round(((run.ended || Date.now()) - run.started) / 1000) };
}

function ask({ dir, me, cwd }, args) {
  const mode = args.mode || 'read';
  if (!KINDS.includes(args.to)) throw new Error(`to must be one of ${KINDS.join(', ')}.`);
  if (!which(args.to)) throw new Error(`${args.to} is not installed here.`);

  const id = withState(dir, (state) => {
    const runs = Object.values(state.runs);
    if (runs.filter((r) => r.status === 'running').length >= MAX_ACTIVE_RUNS) {
      throw new Error(`${MAX_ACTIVE_RUNS} runs are active. Wait for one with team_run.`);
    }
    if (runs.filter((r) => Date.now() - r.started < RUN_WINDOW_MS).length >= MAX_RUNS_PER_WINDOW) {
      throw new Error(`Paused: ${MAX_RUNS_PER_WINDOW} runs in 10 minutes. This brake stops agents starting each other in a loop. Tell the user.`);
    }
    return nextId(state, 'r');
  });

  const worktree = args.isolate ? makeWorktree(cwd, dir, id) : null;
  const run = {
    kind: args.to, mode, from: me.name, cwd: worktree ? worktree.tree : cwd, branch: worktree && worktree.branch,
    status: 'running', started: Date.now(), timeoutMinutes: Math.min(args.timeout_minutes || 15, 60),
  };
  const runDir = path.join(dir, 'runs', id);
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'prompt.md'), askPrompt(me, run, args.message));
  withState(dir, (state) => { state.runs[id] = run; });

  spawn(process.execPath, [path.join(__dirname, 'worker.js'), dir, id], {
    detached: true, stdio: 'ignore', windowsHide: true,
  }).unref();

  return runView(id, args.wait_seconds ? waitFor(dir, id, args.wait_seconds) : run);
}

function teamRun({ dir }, { id, stop, wait_seconds: waitSeconds }) {
  if (id && waitSeconds && !stop) {
    if (!withState(dir, (state) => state.runs[id])) throw new Error(`No run ${id}.`);
    return runView(id, waitFor(dir, id, waitSeconds));
  }
  return withState(dir, (state) => {
    if (!id) {
      return { runs: Object.entries(state.runs).slice(-20).map(([key, r]) => ({ id: key, kind: r.kind, status: r.status, from: r.from })) };
    }
    const run = state.runs[id];
    if (!run) throw new Error(`No run ${id}.`);
    if (stop && run.status === 'running') Object.assign(run, { status: 'stopped', ended: Date.now() });
    return runView(id, run);
  });
}

function board({ dir, me }, args) {
  return withState(dir, (state) => {
    const find = () => {
      const task = state.tasks.find((t) => t.id === args.id);
      if (!task) throw new Error(`No task ${args.id}.`);
      return task;
    };
    const blockers = (t) => (t.needs || []).filter((n) => !state.tasks.some((o) => o.id === n && o.status === 'done'));

    if (args.action === 'add') {
      if (!args.title) throw new Error('add needs a title.');
      const task = { id: nextId(state, 't'), title: args.title, brief: args.brief, needs: args.needs || [], status: 'open', by: me.name };
      state.tasks.push(task);
      return task;
    }
    if (args.action === 'claim') {
      const task = find();
      if (task.status !== 'open') throw new Error(`${task.id} is ${task.status}${task.owner ? `, held by ${task.owner}` : ''}.`);
      const open = blockers(task);
      if (open.length) throw new Error(`${task.id} is waiting on ${open.join(', ')}.`);
      return Object.assign(task, { status: 'claimed', owner: me.name });
    }
    if (args.action === 'update') {
      const task = find();
      if (args.status) task.status = args.status;
      if (args.result) task.result = args.result;
      return task;
    }
    return { tasks: state.tasks.map((t) => ({ ...t, ready: t.status === 'open' && !blockers(t).length })) };
  });
}

function lease({ dir, me }, args) {
  return withState(dir, (state) => {
    state.leases = live(state);
    const paths = (args.paths || []).map(cleanPath);
    if (args.action === 'acquire') {
      if (!paths.length) throw new Error('acquire needs paths.');
      const clash = state.leases.find((l) => l.owner !== me.name && paths.some((p) => overlaps(p, l.path)));
      if (clash) throw new Error(`${clash.path} is held by ${clash.owner}.`);
      const minutes = Math.min(args.minutes || 15, 120);
      state.leases = state.leases.filter((l) => !(l.owner === me.name && paths.includes(l.path)));
      paths.forEach((p) => state.leases.push({ path: p, owner: me.name, until: Date.now() + minutes * 60000 }));
    } else if (args.action === 'release') {
      state.leases = state.leases.filter((l) => !(l.owner === me.name && (!paths.length || paths.includes(l.path))));
    }
    return { leases: state.leases.map((l) => ({ path: l.path, owner: l.owner, minutes_left: Math.ceil((l.until - Date.now()) / 60000) })) };
  });
}

function note({ dir, me }, args) {
  return withState(dir, (state) => {
    if (args.action === 'add') {
      if (!args.text || args.text.length > MAX_NOTE) throw new Error(`A note needs text, up to ${MAX_NOTE} characters.`);
      const item = { id: nextId(state, 'n'), text: args.text, paths: (args.paths || []).map(cleanPath), by: me.name };
      state.notes.push(item);
      return item;
    }
    if (args.action === 'drop') {
      state.notes = state.notes.filter((n) => n.id !== args.id);
      return { dropped: args.id };
    }
    const wanted = args.path && cleanPath(args.path);
    return { notes: state.notes.filter((n) => !wanted || n.paths.some((p) => overlaps(p, wanted))) };
  });
}

function skillDirs() {
  const root = path.join(STACK, 'skills');
  return fs.readdirSync(root).flatMap((set) => fs.readdirSync(path.join(root, set)).map((name) => ({ set, name, dir: path.join(root, set, name) })));
}

function skills(_ctx, { name, file }) {
  const all = skillDirs();
  if (!name) {
    return {
      skills: all.map((s) => {
        const text = fs.readFileSync(path.join(s.dir, 'SKILL.md'), 'utf8');
        return { name: s.name, set: s.set, description: (text.match(/^description: "?(.*?)"?$/m) || [])[1] };
      }),
    };
  }
  const skill = all.find((s) => s.name === name);
  if (!skill) throw new Error(`No skill ${name}.`);
  const target = path.resolve(skill.dir, file || 'SKILL.md');
  if (!target.startsWith(skill.dir + path.sep)) throw new Error('That file is outside the skill.');
  return { name, file: file || 'SKILL.md', text: fs.readFileSync(target, 'utf8') };
}

const handlers = {
  team_roster: roster, team_send: send, team_inbox: inbox, team_ask: ask, team_run: teamRun, board, lease, note, skills,
};

module.exports = { STACK, definitions, handlers };
