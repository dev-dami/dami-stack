// A dependency-free MCP server over stdio: one JSON-RPC message per line.
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { STACK, definitions, handlers } = require('./tools');
const { hubDir, withState } = require('./store');

const VERSION = require('../package.json').version;
const LATEST_PROTOCOL = '2025-06-18';

const cwd = process.env.DAMI_HUB_CWD || process.cwd();
const dir = hubDir(cwd);
const me = { name: process.env.DAMI_AGENT || `agent-${process.pid}`, kind: 'agent' };
const ctx = { cwd, dir, me };

const send = (message) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);

function kindOf(clientName) {
  const name = (clientName || '').toLowerCase();
  return ['claude', 'codex', 'opencode'].find((k) => name.includes(k)) || 'agent';
}

function join(clientInfo) {
  me.kind = kindOf(clientInfo && clientInfo.name);
  if (!process.env.DAMI_AGENT) me.name = `${me.kind}-${process.pid}`;
  withState(dir, (state) => { state.agents[me.name] = { kind: me.kind, seen: Date.now() }; });
}

function touch() {
  withState(dir, (state) => {
    state.agents[me.name] = { ...state.agents[me.name], kind: me.kind, seen: Date.now(), left: false };
  });
}

function instructions() {
  const file = path.join(STACK, 'skills', 'ground', 'house-rules', 'routing-map.md');
  const map = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  return `${map}\nThe dami hub connects the agents working in this repo. Use team_ask to get another agent's work or opinion, and read skills with the skills tool if your client has no copy.`;
}

// Claude Code has these as plugin commands, so they would only appear twice there.
function prompts() {
  if (me.kind === 'claude') return [];
  const root = path.join(STACK, 'commands');
  return fs.readdirSync(root).filter((f) => f.endsWith('.md')).map((f) => {
    const text = fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
    const [, head = '', body = ''] = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/) || [];
    return {
      name: f.replace(/\.md$/, ''),
      description: (head.match(/^description: "?(.*?)"?$/m) || [])[1],
      arguments: [{ name: 'focus', description: 'What it applies to', required: false }],
      body: body.trim(),
    };
  });
}

function respond(method, params) {
  if (method === 'initialize') {
    join(params.clientInfo);
    return {
      protocolVersion: params.protocolVersion || LATEST_PROTOCOL,
      capabilities: { tools: {}, prompts: {} },
      serverInfo: { name: 'dami', version: VERSION },
      instructions: instructions(),
    };
  }
  if (method === 'ping') return {};
  if (method === 'tools/list') return { tools: definitions };
  if (method === 'prompts/list') {
    return { prompts: prompts().map(({ name, description, arguments: args }) => ({ name, description, arguments: args })) };
  }
  if (method === 'prompts/get') {
    const prompt = prompts().find((p) => p.name === params.name);
    if (!prompt) throw Object.assign(new Error(`No prompt ${params.name}.`), { code: -32602 });
    const focus = (params.arguments && params.arguments.focus) || '';
    return { messages: [{ role: 'user', content: { type: 'text', text: prompt.body.replace('$ARGUMENTS', focus) } }] };
  }
  if (method === 'tools/call') {
    const handler = handlers[params.name];
    if (!handler) throw Object.assign(new Error(`No tool ${params.name}.`), { code: -32602 });
    touch();
    try {
      const result = handler(ctx, params.arguments || {});
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: err.message }] };
    }
  }
  throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
}

function leave() {
  try {
    withState(dir, (state) => { if (state.agents[me.name]) state.agents[me.name].left = true; });
  } catch { /* shutting down */ }
}

const lines = readline.createInterface({ input: process.stdin });
lines.on('line', (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    send({ id: null, error: { code: -32700, message: 'Parse error' } });
    return;
  }
  if (message.id === undefined) return;
  try {
    send({ id: message.id, result: respond(message.method, message.params || {}) });
  } catch (err) {
    send({ id: message.id, error: { code: err.code || -32603, message: err.message } });
  }
});
lines.on('close', () => {
  leave();
  process.exit(0);
});
