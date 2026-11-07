#!/usr/bin/env node
// Pre-execution guard: reads a tool call as JSON on stdin and blocks destructive git commands.
// Exit 2 with a reason on stderr blocks the call. Exit 0 lets it through.
// Anything that isn't a shell call, including input that isn't JSON, passes.
const fs = require('fs');

const SHELLS = /^(bash|sh|zsh|dash|ksh|cmd|powershell|pwsh)$/;
const EVALS = /^(iex|invoke-expression|eval)$/;
const PREFIXES = /^(sudo|command|exec|time|nohup|call|env|xargs)$/;
const COMMAND_FLAG = /^(-[a-z]*c|-com[a-z]*|\/c|\/k)$/i;
const GIT_VALUE_OPTIONS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env']);
const WHOLE_TREE = /^(\.\.?[\\/]?|\.\/\*|\*|:[\\/]?\.?|:\(top\).*)$/;

// Heredoc and here-string bodies are data, so a commit message can't read as a command.
function dropBodies(text) {
  return text
    .replace(/<<-?\s*['"]?(\w+)['"]?[^\n]*\n[\s\S]*?\n\s*\1\b/g, ' ')
    .replace(/@'\r?\n[\s\S]*?\r?\n'@/g, ' ')
    .replace(/@"\r?\n[\s\S]*?\r?\n"@/g, ' ');
}

// Splits a command line into segments of tokens, respecting quotes.
// Backslash stays literal because it is the path separator on Windows.
function lex(text) {
  const segments = [];
  const nested = [];
  let tokens = [];
  let word = '';
  let quote = '';
  let started = false;
  const endWord = () => {
    if (started) tokens.push(word);
    word = '';
    started = false;
  };
  const endSegment = () => {
    endWord();
    if (tokens.length) segments.push(tokens);
    tokens = [];
  };
  // Returns the index of the paren closing the one just before `start`.
  const closing = (start) => {
    let depth = 1;
    let j = start;
    while (j < text.length && depth) {
      if (text[j] === '(') depth += 1;
      if (text[j] === ')') depth -= 1;
      j += 1;
    }
    return j - 1;
  };

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const next = text[i + 1] || '';
    if (quote) {
      if (c === quote) quote = '';
      else if (quote === '"' && c === '\\' && next === '"') { word += '"'; i += 1; }
      else if (quote === '"' && c === '$' && next === '(') {
        const end = closing(i + 2);
        nested.push(text.slice(i + 2, end));
        i = end;
      } else word += c;
    } else if (c === '"' || c === "'") { quote = c; started = true; }
    else if ((c === '\\' || c === '`') && (next === '\n' || next === '\r')) i += next === '\r' ? 2 : 1;
    else if (/[;&|()\r\n`]/.test(c)) endSegment();
    else if (/\s/.test(c)) endWord();
    else { word += c; started = true; }
  }
  endSegment();
  return { segments, nested };
}

const commandName = (token) => token.split(/[\\/]/).pop().toLowerCase().replace(/\.(exe|cmd|bat)$/, '');
const isLong = (arg, word) => arg.length > 3 && `--${word}`.startsWith(arg);
const shortHas = (arg, flag) => /^-[^-]/.test(arg) && arg.includes(flag);
const positional = (args) => args.filter((a) => !a.startsWith('-'));

function gitProblem(args) {
  let i = 0;
  while (i < args.length && args[i].startsWith('-')) i += GIT_VALUE_OPTIONS.has(args[i]) ? 2 : 1;
  const sub = (args[i] || '').toLowerCase();
  const rest = args.slice(i + 1);
  const forced = rest.some((a) => shortHas(a, 'f') || isLong(a, 'force'));

  if (sub === 'push') return 'git push';
  if (sub === 'reset' && rest.some((a) => isLong(a, 'hard'))) return 'git reset --hard';
  if (sub === 'clean' && forced) return 'a forced git clean';
  if (sub === 'branch') {
    const deleting = rest.some((a) => shortHas(a, 'd') || isLong(a, 'delete'));
    if (rest.some((a) => shortHas(a, 'D')) || (forced && deleting)) return 'forced branch deletion';
  }
  if (sub === 'checkout' && forced) return 'a forced git checkout';
  if ((sub === 'checkout' || sub === 'restore') && positional(rest).some((a) => WHOLE_TREE.test(a))) {
    return `a whole-tree git ${sub}`;
  }
  return null;
}

function segmentProblem(tokens) {
  for (let i = 0; i < tokens.length; i += 1) {
    const head = commandName(tokens[i]);
    if (head === 'git') return gitProblem(tokens.slice(i + 1));
    if (EVALS.test(head)) return find(tokens.slice(i + 1).join(' '));
    if (SHELLS.test(head)) {
      const flag = tokens.findIndex((t, n) => n > i && COMMAND_FLAG.test(t));
      return flag < 0 ? null : find(tokens.slice(flag + 1).join(' '));
    }
    // Only assignments and pass-through words may stand before the real command.
    if (!/^\w+=/.test(tokens[i]) && !PREFIXES.test(head)) return null;
  }
  return null;
}

function find(command) {
  const { segments, nested } = lex(dropBodies(command));
  for (const tokens of segments) {
    const problem = segmentProblem(tokens);
    if (problem) return problem;
  }
  for (const inner of nested) {
    const problem = find(inner);
    if (problem) return problem;
  }
  return null;
}

function readCommand() {
  try {
    const input = JSON.parse(fs.readFileSync(0, 'utf8'));
    const command = (input.tool_input && input.tool_input.command) || input.command;
    return typeof command === 'string' ? command : '';
  } catch {
    return '';
  }
}

const problem = find(readCommand());
if (problem) {
  console.error(`Blocked by git-safety: the user prohibits ${problem} here. Stop and tell the user what you wanted to run. Do not work around this.`);
  process.exit(2);
}
