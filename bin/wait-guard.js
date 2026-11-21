#!/usr/bin/env node
// Plugin PreToolUse hook on Bash: refuse a call that would block for more than 4 minutes.
// A long blocking wait lets the prompt cache expire, so the next call rewrites the whole
// context; a chunked wait that re-checks keeps it warm. Exit 2 refuses the call and shows
// stderr to the agent. A hook must never break a session, so anything unexpected exits 0.
// Plugin PreToolUse hooks also fire inside Claude Code subagents [observed]: a subagent's
// unbounded poll loop was refused with this message when the plugin loaded via --plugin-dir.
const CHUNK_S = 240;
const MESSAGE = 'Split the wait: no call may block over 4 minutes. Use timeout 240 sh -c "until ...; do sleep 15; done", then re-check, or run it with run_in_background.';

const UNIT_S = { '': 1, s: 1, m: 60, h: 3600, d: 86400 };

// Seconds in one duration operand such as 240, 4m or 1.5h; NaN when it isn't one.
function seconds(word) {
  if (word === 'infinity') return Infinity;
  const m = /^(\d+(?:\.\d+)?|\.\d+)([smhd]?)$/.exec(word || '');
  return m ? Number(m[1]) * UNIT_S[m[2]] : NaN;
}

// Splits at ; && || | and newlines outside quotes, so each piece is one command.
function pieces(command) {
  const out = [];
  let cur = '';
  let quote = '';
  for (let i = 0; i < command.length; i += 1) {
    const c = command[i];
    if (c === '\\' && quote !== "'") { cur += c + (command[i + 1] || ''); i += 1; continue; }
    if (quote) { cur += c; if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'") { quote = c; cur += c; continue; }
    if (c === ';' || c === '\n' || c === '|' || (c === '&' && command[i + 1] === '&')) {
      out.push(cur);
      cur = '';
      if (c !== ';' && c !== '\n' && command[i + 1] === c) i += 1;
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

// True when the piece runs under `timeout <240s or less>`, which bounds that piece only.
function capped(rest) {
  const words = rest.trim().split(/\s+/);
  if (words[0] !== 'timeout') return false;
  for (let i = 1; i < words.length; i += 1) {
    if (['-k', '-s', '--kill-after', '--signal'].includes(words[i])) { i += 1; continue; }
    if (words[i].startsWith('-')) continue;
    return seconds(words[i]) <= CHUNK_S;
  }
  return false;
}

// A loop polls when its condition re-checks the outside world: a command, true, or a file
// test. Reading input, getopts, and counter or string tests end on their own, so they pass.
function polls(condition) {
  const cond = condition.replace(/^[\s!]+/, '').replace(/[\s;]+$/, '');
  if (/^(\[|test\b)/.test(cond)) return /\s-[edfsrwxL]\s/.test(cond);
  return !/^\(\(|\b(read|getopts)\b/.test(cond);
}

// Returns a reason to refuse, or '' to allow. When the command is ambiguous, allow it.
function verdict(call) {
  if (!call || (call.tool_name && call.tool_name !== 'Bash')) return '';
  const input = call.tool_input || call;
  if (input.run_in_background === true) return '';
  // A generous timeout is only a ceiling: a quick command under timeout 600000 keeps the
  // cache warm, so the timeout alone is never a reason to refuse. Judge the command.
  const text = pieces(String(input.command || '')).map((piece) => {
    const [lead] = /^\s*(?:(?:do|then|else)\s+|[!{(]\s*)*/.exec(piece);
    return capped(piece.slice(lead.length)) ? `${lead}true` : piece;
  }).join('; ');
  const loops = [...text.matchAll(/\b(?:while|until)\s([\s\S]*?)\bdo\b(?=[\s\S]*\bdone\b)/g)];
  if (loops.some((m) => polls(m[1]))) return MESSAGE;
  let total = 0;
  for (const m of text.matchAll(/\bsleep((?:\s+[\w.]+)+)/g)) {
    for (const word of m[1].trim().split(/\s+/)) {
      const s = seconds(word);
      if (Number.isNaN(s)) break;
      total += s;
    }
  }
  return total > CHUNK_S ? MESSAGE : '';
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
