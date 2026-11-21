#!/usr/bin/env node
// Plugin PreToolUse hook on Bash: refuse a call that would block for more than 4 minutes.
// A long blocking wait lets the prompt cache expire, so the next call rewrites the whole
// context; a chunked wait that re-checks keeps it warm. Exit 2 refuses the call and shows
// stderr to the agent. A hook must never break a session, so anything unexpected exits 0.
// Plugin PreToolUse hooks also fire inside Claude Code subagents [observed]: a subagent's
// unbounded poll loop was refused with this message when the plugin loaded via --plugin-dir.
const CHUNK_S = 240;
const MESSAGE = 'Split the wait: no call may block over 4 minutes. Use timeout 240 sh -c "until ...; do sleep 15; done", then re-check, or run it with run_in_background.';

// Returns a reason to refuse, or '' to allow.
function verdict(call) {
  if (!call || (call.tool_name && call.tool_name !== 'Bash')) return '';
  const input = call.tool_input || call;
  if (input.run_in_background === true) return '';
  // A generous timeout is only a ceiling: a quick command under timeout 600000 keeps the
  // cache warm, so the timeout alone is never a reason to refuse. Judge the command.
  const command = String(input.command || '');
  const capped = [...command.matchAll(/\btimeout\s+(?:-\S+\s+)*(\d+)s?\b/g)].some((m) => Number(m[1]) <= CHUNK_S);
  if (capped) return '';
  const sleeps = [...command.matchAll(/\bsleep\s+(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  if (!sleeps.length) return '';
  const polling = /\b(until|while)\b/.test(command); // unbounded; a short for-retry loop is fine
  const total = sleeps.reduce((a, b) => a + b, 0);
  return polling || total > CHUNK_S ? MESSAGE : '';
}

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', (chunk) => { raw += chunk; });
  process.stdin.on('end', () => {
    let reason = '';
    try { reason = verdict(JSON.parse(raw)); } catch { reason = ''; }
    if (reason) {
      process.stderr.write(`${reason}\n`);
      process.exitCode = 2;
    }
  });
}

module.exports = { verdict };
