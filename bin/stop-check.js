#!/usr/bin/env node
// Plugin Stop hook: one deterministic nudge before the agent ends its turn.
// 1. Work is still running (background tasks, or hub runs) but the message has no
//    `Done:` line, so the user would have to chase the status.
// 2. A GitHub repo, PR, issue, release or compare link sits only behind markdown text,
//    so the user can't copy the raw URL.
// It blocks at most once per stop (stop_hook_active), never for hub workers (DAMI_RUN:
// they end with a report), and DAMI_STOP_CHECK=0 turns it off. No model call, no network.
// A hook must never break a session, so anything unexpected exits 0 with no output.
const fs = require('fs');

const RUNNING = 'Work is still running: end with the status shape (Done: no, what runs, ETA, next update), from artifacts.md in house-rules.';
const GITHUB_LINK = /\[[^\]]*\]\((https?:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\/(?:pull|issues)\/\d+|\/(?:releases|compare)\/[^\s()]*)?\/?)\)/g;
const TAIL_BYTES = 256 * 1024;

// The last assistant text in a transcript, for hosts that don't send last_assistant_message.
function lastFromTranscript(file) {
  if (typeof file !== 'string' || !file) return null;
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - TAIL_BYTES);
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    const lines = buf.toString('utf8').split('\n').reverse();
    for (const line of lines) {
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }
      const message = entry && entry.type === 'assistant' && entry.message;
      const content = message && Array.isArray(message.content) ? message.content : [];
      const text = content.filter((c) => c && c.type === 'text').map((c) => c.text).join('\n');
      if (text) return text;
    }
    return null;
  } finally {
    fs.closeSync(fd);
  }
}

function linkUrls(msg) {
  const urls = [...new Set([...msg.matchAll(GITHUB_LINK)].map((m) => m[1]))];
  // A URL also shown bare somewhere (not right after "](") needs no nudge.
  return urls.filter((url) => {
    let at = msg.indexOf(url);
    while (at !== -1) {
      if (msg.slice(Math.max(0, at - 2), at) !== '](') return false;
      at = msg.indexOf(url, at + 1);
    }
    return true;
  });
}

// Returns the reasons to block, or [] to let the turn end.
function reasons(input, running) {
  if (!input || typeof input !== 'object' || input.stop_hook_active === true) return [];
  let msg = input.last_assistant_message;
  if (typeof msg !== 'string') {
    try { msg = lastFromTranscript(input.transcript_path); } catch { msg = null; }
  }
  if (typeof msg !== 'string') return []; // Nothing to judge.
  const out = [];
  const busy = (Array.isArray(input.background_tasks) && input.background_tasks.length > 0) || running();
  if (busy && !/^\W*Done:\s*(yes|no)\b/im.test(msg)) out.push(RUNNING);
  const urls = linkUrls(msg);
  if (urls.length) out.push(`Add raw URLs under Links, one per line: ${urls.join(' ')}`);
  return out;
}

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', (chunk) => { raw += chunk; });
  process.stdin.on('end', () => {
    try {
      if (process.env.DAMI_RUN || process.env.DAMI_STOP_CHECK === '0') return;
      const input = JSON.parse(raw);
      const running = () => {
        const { teamCounts } = require('./team-state');
        const counts = teamCounts(input.cwd || process.cwd());
        return Boolean(counts && counts.running > 0);
      };
      const why = reasons(input, running);
      if (why.length) process.stdout.write(`${JSON.stringify({ decision: 'block', reason: why.join(' ') })}\n`);
    } catch { /* never trap a session */ } finally {
      process.exitCode = 0;
    }
  });
}

module.exports = { reasons };
