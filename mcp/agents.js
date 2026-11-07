// How to start each agent CLI headless, with the prompt on stdin so that no shell
// ever interprets message text.
const fs = require('fs');
const path = require('path');

const KINDS = ['claude', 'codex', 'opencode'];

function which(name) {
  const override = process.env[`DAMI_CLI_${name.toUpperCase()}`];
  if (override) return override;
  const exts = process.platform === 'win32' ? (process.env.PATHEXT || '.EXE;.CMD').split(';') : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    for (const ext of exts) {
      const file = path.join(dir, name + ext);
      if (dir && fs.existsSync(file)) return file;
    }
  }
  return null;
}

function command(run, outFile) {
  const write = run.mode === 'write';
  if (run.kind === 'claude') {
    return { args: ['-p', '--output-format', 'text', ...(write ? ['--permission-mode', 'acceptEdits'] : [])] };
  }
  if (run.kind === 'codex') {
    return {
      args: ['exec', '--skip-git-repo-check', '-s', write ? 'workspace-write' : 'read-only', '-C', run.cwd, '-o', outFile, '-'],
      replyFile: outFile,
    };
  }
  return { args: ['run', ...(write ? ['--auto'] : [])] };
}

module.exports = { KINDS, command, which };
