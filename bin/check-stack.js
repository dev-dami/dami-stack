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
else if (fs.statSync(abs(mapFile)).size >= 3072) fail(mapFile, 'must be under 3,072 bytes');

// Reference forms. The artifact header key "dami: card" has a space after the colon and stays legal.
const skillFiles = fs.existsSync(abs('skills')) ? walk('skills') : [];
for (const file of skillFiles) {
  const text = fs.readFileSync(abs(file), 'utf8');
  if (/\bdami:\S/.test(text)) fail(file, 'uses a prefixed command or skill name');
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

const only = (process.argv[2] || '').replace(/\\/g, '/').replace(/^\.\//, '');
const shown = failures.filter((line) => line.startsWith(only));
if (shown.length) {
  console.error(`check-stack: ${shown.length} failure(s)\n${shown.map((line) => `- ${line}`).join('\n')}`);
  process.exit(1);
}
console.log(`check-stack: ok${only ? ` under ${only}` : ''} (${skills.length} skills, ${commandNames.length} commands)`);
