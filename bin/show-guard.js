#!/usr/bin/env node
// Plugin PreToolUse hook on host artifact tools: when ~/.dami/prefs.md has a show: line,
// refuse publishing a host artifact and point at the user's own share command instead.
// Reading, listing, opening, pinning and deleting still pass, so unpublishing works.
// Exit 2 refuses the call and shows stderr to the agent. A hook must never break a
// session, so a parse error, a missing prefs file or a missing show: line exits 0.
const fs = require('fs');
const os = require('os');
const path = require('path');

// The host's artifact tool, bare or behind an MCP prefix. Other servers' tools that only
// mention artifacts (build caches, CI outputs) aren't host publishing, so they pass.
function isArtifactTool(name) {
  const last = String(name || '').split('__').pop();
  return /^artifacts?$/i.test(last) || /^(publish|create)_artifacts?$/i.test(last);
}

// Returns the refusal message, or '' to allow.
function verdict(call, prefs) {
  if (!call || !isArtifactTool(call.tool_name)) return '';
  const action = (call.tool_input || {}).action;
  if (action !== undefined && action !== 'publish') return '';
  const show = /^show:\s*(.+)$/m.exec(prefs || '');
  if (!show) return '';
  return `prefs: show via ${show[1].trim()}; give the URL it prints. Host artifacts are off for this user.`;
}

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', (chunk) => { raw += chunk; });
  process.stdin.on('end', () => {
    let reason = '';
    try {
      const prefs = fs.readFileSync(path.join(os.homedir(), '.dami', 'prefs.md'), 'utf8');
      reason = verdict(JSON.parse(raw), prefs);
    } catch { reason = ''; }
    if (reason) {
      process.stderr.write(`${reason}\n`);
      process.exitCode = 2;
    }
  });
}

module.exports = { verdict };
