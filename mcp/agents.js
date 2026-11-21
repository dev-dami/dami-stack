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

// Model and effort flags: claude's --model and --effort are checked against its --help
// [observed]; codex's -m and model_reasoning_effort, and opencode's --model, are [assumed].
function modelArgs(run) {
  const { model, effort } = run;
  if (run.kind === 'claude') return [...(model ? ['--model', model] : []), ...(effort ? ['--effort', effort] : [])];
  if (run.kind === 'codex') return [...(model ? ['-m', model] : []), ...(effort ? ['-c', `model_reasoning_effort=${effort}`] : [])];
  return model ? ['--model', model] : [];
}

function command(run, outFile) {
  const write = run.mode === 'write';
  if (run.kind === 'claude') {
    return { args: ['-p', '--output-format', 'text', ...(write ? ['--permission-mode', 'acceptEdits'] : []), ...modelArgs(run)] };
  }
  if (run.kind === 'codex') {
    return {
      args: ['exec', '--skip-git-repo-check', '-s', write ? 'workspace-write' : 'read-only', '-C', run.cwd, '-o', outFile, ...modelArgs(run), '-'],
      replyFile: outFile,
    };
  }
  return { args: ['run', ...(write ? ['--auto'] : []), ...modelArgs(run)] };
}

module.exports = { KINDS, command, which };
