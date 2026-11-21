#!/usr/bin/env node
// Plugin SessionStart hook: its output becomes session context, which is what makes skills proactive.
// A hub-started run (DAMI_RUN set) prints nothing: the MCP server gives it the worker card.
// Otherwise it prints the routing map, then the user's standing preferences from ~/.dami/prefs.md.
// A hook must never break a session, so any missing file prints nothing and exits 0.
const fs = require('fs');
const os = require('os');
const path = require('path');

const MAP = path.resolve(__dirname, '..', 'skills', 'ground', 'house-rules', 'routing-map.md');
const PREFS_LIMIT = 1500;

if (!process.env.DAMI_RUN) {
  try {
    process.stdout.write(fs.readFileSync(MAP, 'utf8'));
  } catch { /* no map, no output */ }
  try {
    const prefs = fs.readFileSync(path.join(os.homedir(), '.dami', 'prefs.md'), 'utf8').trim().slice(0, PREFS_LIMIT);
    if (prefs) process.stdout.write(`\n## Your standing preferences\n${prefs}\n`);
  } catch { /* no prefs file */ }
}
process.exitCode = 0;
