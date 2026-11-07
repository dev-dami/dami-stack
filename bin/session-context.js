#!/usr/bin/env node
// Plugin SessionStart hook: its output becomes session context, which is what makes skills proactive.
// A hook must never break a session, so a missing map prints nothing and exits 0.
const fs = require('fs');
const path = require('path');

const MAP = path.resolve(__dirname, '..', 'skills', 'ground', 'house-rules', 'routing-map.md');

try {
  process.stdout.write(fs.readFileSync(MAP, 'utf8'));
} catch {
  process.exitCode = 0;
}
