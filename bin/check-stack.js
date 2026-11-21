#!/usr/bin/env node
// Checks the stack's structural rules. Exits 1 with a list of failures.
// `node bin/check-stack.js skills/settle` reports only failures under that path.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const abs = (rel) => path.join(root, rel);
const dirs = (rel) => (fs.existsSync(abs(rel)) ? fs.readdirSync(abs(rel), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : []);
const walk = (rel) => fs.readdirSync(abs(rel), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${rel}/${e.name}`) : [`${rel}/${e.name}`]));

// Gated skills and the gates each must name, from section 3 of the design.
const GATED = {
  'shared-words': ['G3'],
  'agent-prose': ['G3'],
  'throwaway-spike': ['G2'],
  'work-chart': ['G1', 'G5'],
  'intake-desk': ['G1', 'G4'],
  'crew-lead': ['G1', 'G2', 'G3', 'G6'],
  'baton-pass': ['G1', 'G6'],
  'merge-case': ['G1'],
  'repo-fitting': ['G2', 'G3'],
  'walk-me-through': ['G2'],
  'host-connect': ['G3', 'G6'],
};
const GATE_LINE = /^Gate: get the user's OK before .+ \(([^()]*)\)\. See gates\.md in the skill house-rules\.$/;

const failures = [];
const fail = (where, what) => failures.push(`${where}: ${what}`);

const skills = dirs('skills').flatMap((set) => dirs(`skills/${set}`).map((name) => ({ name, dir: `skills/${set}/${name}` })));
const skillNames = new Set(skills.map((s) => s.name));
const commandFiles = fs.existsSync(abs('commands')) ? walk('commands') : [];
const commandNames = commandFiles.map((f) => path.basename(f, '.md'));
const agentFiles = fs.existsSync(abs('agents')) ? walk('agents').filter((f) => f.endsWith('.md')) : [];
const agentNames = agentFiles.map((f) => path.basename(f, '.md'));

// Reads a file's YAML frontmatter as flat key: value lines, unquoting a quoted value.
const frontmatter = (file) => {
  const head = /^---\r?\n([\s\S]*?)\r?\n---/.exec(fs.readFileSync(abs(file), 'utf8'));
  if (!head) return null;
  const get = (key) => {
    const value = ((new RegExp(`^${key}:[ \\t]*(.*)$`, 'm').exec(head[1]) || [])[1] || '').trim();
    return /^(["']).*\1$/.test(value) ? value.slice(1, -1) : value;
  };
  return { get, head: head[0] };
};

// Frontmatter, name, description, gate line.
for (const { name, dir } of skills) {
  const file = `${dir}/SKILL.md`;
  if (!fs.existsSync(abs(file))) { fail(dir, 'no SKILL.md'); continue; }
  const text = fs.readFileSync(abs(file), 'utf8');
  const head = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!head) { fail(file, 'no frontmatter'); continue; }
  const field = (key) => (new RegExp(`^${key}:[ \\t]*(.*)$`, 'm').exec(head[1]) || [])[1] || '';
  if (field('name').trim() !== name) fail(file, `name "${field('name').trim()}" differs from its folder`);
  let description = field('description').trim();
  if (/^["']/.test(description)) description = description.slice(1, -1);
  else if (/: | #/.test(description)) fail(file, 'description holds ": " or " #", so YAML needs it quoted');
  if (!description) fail(file, 'description missing');
  if (description.length >= 200) fail(file, `description is ${description.length} characters, limit is under 200`);
  if (GATED[name]) {
    const [, gateLine = ''] = text.slice(head[0].length).split(/\r?\n/).filter((line) => line.trim());
    const match = GATE_LINE.exec(gateLine.trim());
    if (!match) fail(file, 'gated skill lacks the Gate: reminder as the line under its title');
    else for (const gate of GATED[name]) if (!match[1].includes(gate)) fail(file, `Gate: line doesn't name ${gate}`);
  }
}

// plugin.json lists exactly the skill folders.
const pluginFile = '.claude-plugin/plugin.json';
const listed = JSON.parse(fs.readFileSync(abs(pluginFile), 'utf8')).skills || [];
const listedDirs = listed.map((p) => p.replace(/^\.\//, '').replace(/\/$/, ''));
for (const dir of listedDirs) if (!fs.existsSync(abs(dir))) fail(pluginFile, `lists ${dir}, which doesn't exist`);
for (const { dir } of skills) if (!listedDirs.includes(dir)) fail(pluginFile, `doesn't list ${dir}`);

// Names: skills have a hyphen, commands don't, none overlap.
for (const { name, dir } of skills) if (!name.includes('-')) fail(dir, 'skill name has no hyphen');
for (const name of commandNames) {
  if (name.includes('-')) fail(`commands/${name}.md`, 'command name has a hyphen');
  if (skillNames.has(name)) fail(`commands/${name}.md`, 'name overlaps a skill');
}

// Routing map size.
const mapFile = 'skills/ground/house-rules/routing-map.md';
if (!fs.existsSync(abs(mapFile))) fail(mapFile, 'missing');
else {
  if (fs.statSync(abs(mapFile)).size >= 2700) fail(mapFile, 'must be under 2,700 bytes');
  const map = fs.readFileSync(abs(mapFile), 'utf8');
  for (const must of ['4 minutes', 'Needs you']) if (!map.includes(must)) fail(mapFile, `lost the rule naming "${must}"`);
}

// Standing OKs exist, and merge stays out of them.
const gatesFile = 'skills/ground/house-rules/gates.md';
const gates = fs.existsSync(abs(gatesFile)) ? fs.readFileSync(abs(gatesFile), 'utf8') : '';
if (!gates.includes('## Standing OK')) fail(gatesFile, 'lacks the ## Standing OK section');
else if (!/Merge[^.\n]*can't be standing/.test(gates.split('## Standing OK')[1])) fail(gatesFile, "Standing OK doesn't say merge can't be standing");

// The worker card that the MCP server sends Claude subagents and hub runs.
const workerFile = 'skills/ground/house-rules/worker.md';
if (!fs.existsSync(abs(workerFile))) fail(workerFile, 'missing');
else if (fs.statSync(abs(workerFile)).size >= 1500) fail(workerFile, 'must be under 1,500 bytes');

// Every plugin hook runs a script that exists, under a timeout, so none can hang a session.
const hooksFile = 'hooks/hooks.json';
const hookGroups = fs.existsSync(abs(hooksFile)) ? Object.values(JSON.parse(fs.readFileSync(abs(hooksFile), 'utf8')).hooks || {}).flat() : [];
for (const hook of hookGroups.flatMap((group) => group.hooks || [])) {
  const [, script] = /\$\{CLAUDE_PLUGIN_ROOT\}\/([^"\s]+)/.exec(hook.command || '') || [];
  if (!script || !fs.existsSync(abs(script))) fail(hooksFile, `"${hook.command}" names no script in the repo`);
  if (!(hook.timeout > 0 && hook.timeout <= 10)) fail(hooksFile, `"${hook.command}" needs a timeout of 10 seconds or less`);
}

// Reference forms. The artifact header key "dami: card" has a space after the colon and stays legal.
const skillFiles = fs.existsSync(abs('skills')) ? walk('skills') : [];
for (const file of skillFiles) {
  const text = fs.readFileSync(abs(file), 'utf8');
  // Plugin agents (dami:scout and the rest) exist only on Claude Code and are named only as the host-level form.
  for (const [ref, name] of text.matchAll(/\bdami:([a-z0-9-]+)/g)) if (!agentNames.includes(name)) fail(file, `uses a prefixed command or skill name: ${ref}`);
  if (/\bdami:(?![a-z0-9-])\S/.test(text)) fail(file, 'uses a prefixed command or skill name');
  const depth = file.split('/').length - 4; // Folders below skills/<set>/<skill>/.
  for (const [ups] of text.matchAll(/(?:\.\.\/)+/g)) {
    if (ups.length / 3 > depth) fail(file, `"${ups}" climbs out of its skill`);
  }
}
for (const file of [...skillFiles, ...commandFiles]) {
  const text = fs.readFileSync(abs(file), 'utf8');
  for (const match of text.matchAll(/\bthe skill\s+(?:`([a-z0-9-]+)`|([a-z0-9]+-[a-z0-9-]+))/gi)) {
    const name = match[1] || match[2];
    if (!skillNames.has(name)) fail(file, `names unknown skill "${name}"`);
  }
}

// Role agents: each pins the model its row in the Models table of levels.md names, and the read-only roles can't edit.
const AGENT_MODELS = { scout: 'sonnet', checker: 'sonnet', judge: 'opus', worker: 'opus' };
const READ_ONLY_AGENTS = ['scout', 'checker', 'judge'];
const EDIT_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'];
const levelsFile = 'skills/ground/house-rules/levels.md';
const levels = fs.existsSync(abs(levelsFile)) ? fs.readFileSync(abs(levelsFile), 'utf8') : '';
const modelsTable = (levels.split(/^## Models$/m)[1] || '').split(/^## /m)[0];
for (const role of Object.keys(AGENT_MODELS)) if (!agentNames.includes(role)) fail('agents', `no ${role}.md`);
for (const file of agentFiles) {
  const name = path.basename(file, '.md');
  const fm = frontmatter(file);
  if (!fm) { fail(file, 'no frontmatter'); continue; }
  if (fm.get('name') !== name) fail(file, `name "${fm.get('name')}" differs from its file name`);
  const description = fm.get('description');
  if (!description) fail(file, 'description missing');
  if (description.length >= 120) fail(file, `description is ${description.length} characters, limit is under 120`);
  const want = AGENT_MODELS[name];
  if (!want) { fail(file, 'not a role check-stack knows; add it to AGENT_MODELS'); continue; }
  if (fm.get('model') !== want) fail(file, `model "${fm.get('model')}" breaks model routing: the ${name} role runs on ${want}`);
  const row = modelsTable.split('\n').find((line) => line.includes(`\`dami:${name}\``)) || '';
  const other = want === 'opus' ? 'Sonnet' : 'Opus';
  if (!row) fail(levelsFile, `Models table has no row naming \`dami:${name}\``);
  else if (!row.includes(want === 'opus' ? 'Opus' : 'Sonnet') || row.includes(other)) fail(levelsFile, `the row for dami:${name} must name ${want === 'opus' ? 'Opus' : 'Sonnet'} only, to match check-stack's model routing`);
  if (READ_ONLY_AGENTS.includes(name)) {
    const tools = fm.get('tools').split(/[\s,]+/).filter(Boolean);
    if (!tools.length) fail(file, `read-only role lists no tools, so it inherits ${EDIT_TOOLS.join('/')}`);
    for (const tool of tools) if (EDIT_TOOLS.includes(tool)) fail(file, `read-only role lists ${tool}; it may not have ${EDIT_TOOLS.join('/')}`);
  }
}

// Always-on budget: every skill, command and agent description loads in every session.
// The ceiling is the total on this PR's base commit (3,868) plus 1,200 characters, about 300 tokens.
const ALWAYS_ON_CHARS = 5068;
const descriptionFiles = [...skills.map((s) => `${s.dir}/SKILL.md`), ...commandFiles, ...agentFiles].filter((f) => fs.existsSync(abs(f)));
const alwaysOn = descriptionFiles.reduce((sum, file) => sum + ((frontmatter(file) || { get: () => '' }).get('description').length), 0);
if (alwaysOn > ALWAYS_ON_CHARS) fail('always-on', `descriptions total ${alwaysOn} characters, over the ceiling of ${ALWAYS_ON_CHARS}. Shorten one, or move detail into the body`);

const only = (process.argv[2] || '').replace(/\\/g, '/').replace(/^\.\//, '');
const shown = failures.filter((line) => line.startsWith(only));
if (shown.length) {
  console.error(`check-stack: ${shown.length} failure(s)\n${shown.map((line) => `- ${line}`).join('\n')}`);
  process.exit(1);
}
console.log(`check-stack: ok${only ? ` under ${only}` : ''} (${skills.length} skills, ${commandNames.length} commands, ${agentNames.length} agents; always-on ${alwaysOn} of ${ALWAYS_ON_CHARS} characters)`);
