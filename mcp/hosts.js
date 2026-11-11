// Remote machines the hub can hand work to, reached with key-only ssh (a Tailscale address
// works well). Every remote step runs as a bash script sent on stdin, so the remote login
// shell never parses message text, and code travels up and back with git over the same ssh.
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const KIND_PATHS = 'export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:$HOME/.bun/bin:/usr/local/bin:$PATH"';
const NAME = /^[a-z0-9][a-z0-9-]{0,31}$/;

const hostsFile = () => process.env.DAMI_HOSTS_FILE || path.join(os.homedir(), '.dami', 'hosts.json');
// DAMI_SSH swaps the ssh client; a .js file runs under this node (the tests use that).
const sshCmd = () => {
  const bin = process.env.DAMI_SSH || 'ssh';
  return /\.js$/.test(bin) ? [process.execPath, bin] : [bin];
};
const sshArgs = (host) => ['-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', host.ssh];
const sshForGit = () => sshCmd().map((p) => `"${p.replace(/\\/g, '/')}"`).join(' ');

function readHosts() {
  try {
    return JSON.parse(fs.readFileSync(hostsFile(), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

function writeHosts(hosts) {
  fs.mkdirSync(path.dirname(hostsFile()), { recursive: true });
  fs.writeFileSync(hostsFile(), `${JSON.stringify(hosts, null, 2)}\n`);
}

function getHost(name) {
  const host = readHosts()[name];
  if (!host) throw new Error(`No host ${name}. Add one with: damistack host add ${name} <ssh alias>`);
  return { name, root: 'dami', ...host };
}

// Single quotes are safe for anything; a quote inside becomes '\''.
const q = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;

// A root relative to the remote home stays relative, so git's scp-style URLs and bash agree.
const rootExpr = (host) => (host.root.startsWith('/') ? q(host.root) : `"$HOME"/${q(host.root)}`);

// Runs a bash script on the host and waits. Returns { status, stdout, stderr }.
function runScript(host, script, timeoutMs = 60000) {
  const r = spawnSync(sshCmd()[0], [...sshCmd().slice(1), ...sshArgs(host), 'bash', '-s'], {
    input: script, encoding: 'utf8', windowsHide: true, timeout: timeoutMs,
  });
  if (r.error) return { status: 1, stdout: '', stderr: r.error.message };
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

// Same, but returns the child so the caller can stream and stop it.
function spawnScript(host, script) {
  const child = spawn(sshCmd()[0], [...sshCmd().slice(1), ...sshArgs(host), 'bash', '-s'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.on('error', () => {});
  child.stdin.end(script);
  return child;
}

function probe(host) {
  const r = runScript(host, [
    KIND_PATHS,
    'printf "user=%s\\nhost=%s\\n" "$(whoami)" "$(hostname)"',
    'for k in claude codex opencode git tmux; do printf "%s=%s\\n" "$k" "$(command -v $k)"; done',
  ].join('\n'), 30000);
  if (r.status !== 0) throw new Error(`ssh ${host.ssh} failed: ${(r.stderr || r.stdout).trim().slice(-400)}`);
  const facts = Object.fromEntries(r.stdout.trim().split('\n').map((line) => line.split(/=(.*)/s).slice(0, 2)));
  return {
    user: facts.user,
    hostname: facts.host,
    kinds: ['claude', 'codex', 'opencode'].filter((k) => facts[k]),
    git: Boolean(facts.git),
    tmux: Boolean(facts.tmux),
  };
}

function addHost(name, ssh, root) {
  if (!NAME.test(name)) throw new Error('A host name is lower case letters, digits and hyphens.');
  const host = { name, ssh: ssh || name, root: root || 'dami' };
  const facts = probe(host);
  if (!facts.git) throw new Error(`git is not installed on ${name}.`);
  const hosts = readHosts();
  hosts[name] = { ssh: host.ssh, root: host.root, kinds: facts.kinds, added: new Date().toISOString() };
  writeHosts(hosts);
  return { name, ...hosts[name], user: facts.user, hostname: facts.hostname, tmux: facts.tmux };
}

function removeHost(name) {
  const hosts = readHosts();
  if (!hosts[name]) throw new Error(`No host ${name}.`);
  delete hosts[name];
  writeHosts(hosts);
  return { removed: name };
}

// Where this repo lives on the host, relative to its root.
const repoName = (cwd, team) => `${path.basename(path.resolve(cwd)).toLowerCase().replace(/[^a-z0-9._-]/g, '-')}-${team}`;

function gitLocal(cwd, args, timeoutMs = 120000, extraEnv = {}) {
  return spawnSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8', windowsHide: true, timeout: timeoutMs,
    env: { ...process.env, GIT_SSH_COMMAND: `${sshForGit()} -o BatchMode=yes -o ConnectTimeout=15`, GIT_TERMINAL_PROMPT: '0', ...extraEnv },
  });
}

const remoteUrl = (host, repo) => `${host.ssh}:${host.root.replace(/\/$/, '')}/${repo}`;

// The working folder as a tree: edits and new files, minus what .gitignore leaves out.
// A copy of the index takes the staging, so the real index never changes.
function workingTree(cwd) {
  const real = gitLocal(cwd, ['rev-parse', '--path-format=absolute', '--git-path', 'index']).stdout.trim();
  const temp = path.join(os.tmpdir(), `dami-index-${process.pid}-${Date.now()}`);
  try {
    if (real && fs.existsSync(real)) fs.copyFileSync(real, temp);
    const env = { GIT_INDEX_FILE: temp };
    if (gitLocal(cwd, ['add', '-A'], 120000, env).status !== 0) return null;
    const tree = gitLocal(cwd, ['write-tree'], 60000, env);
    return tree.status === 0 ? tree.stdout.trim() : null;
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

// Sends the working folder (uncommitted edits and new files included) to the host as a branch.
// Returns the commit that was sent.
function pushUp(host, cwd, repo, ref) {
  const init = runScript(host, [
    'set -e',
    `R=${rootExpr(host)}/${q(repo)}`,
    'mkdir -p "$R"',
    '[ -d "$R/.git" ] || git -C "$R" init -q',
    'git -C "$R" config receive.denyCurrentBranch updateInstead',
  ].join('\n'));
  if (init.status !== 0) throw new Error(`Could not prepare the repo on ${host.name}: ${init.stderr.trim().slice(-400)}`);

  const head = gitLocal(cwd, ['rev-parse', 'HEAD']);
  if (head.status !== 0) throw new Error('This folder has no commit to send. Commit once, then try again.');
  let sha = head.stdout.trim();
  // Uncommitted work goes up as one plain commit on HEAD. Nothing local changes.
  const tree = workingTree(cwd);
  const headTree = gitLocal(cwd, ['rev-parse', 'HEAD^{tree}']).stdout.trim();
  if (tree && tree !== headTree) {
    const made = gitLocal(cwd, ['-c', 'user.name=dami', '-c', 'user.email=dami@localhost', 'commit-tree', tree, '-p', sha, '-m', `dami: uncommitted work sent to ${host.name}`]);
    if (made.status === 0) sha = made.stdout.trim();
  }
  const push = gitLocal(cwd, ['push', '--force', '--no-verify', remoteUrl(host, repo), `${sha}:refs/heads/${ref}`]);
  if (push.status !== 0) throw new Error(`git push to ${host.name} failed: ${push.stderr.trim().slice(-400)}`);
  return sha;
}

function fetchBack(host, cwd, repo, remoteRef, localRef) {
  const r = gitLocal(cwd, ['fetch', '--no-tags', remoteUrl(host, repo), `+refs/heads/${remoteRef}:refs/heads/${localRef}`]);
  if (r.status !== 0) throw new Error(`git fetch from ${host.name} failed: ${r.stderr.trim().slice(-400)}`);
}

// The remote side of one run: a worktree for it, the agent, a commit of what it changed.
// Only the reply goes to stdout; everything else goes to stderr.
function runScriptFor(host, { repo, id, base, branch, write, agentLine, prompt, timeoutMinutes }) {
  const b64 = Buffer.from(prompt, 'utf8').toString('base64');
  return [
    'set -o pipefail',
    KIND_PATHS,
    'export DAMI_RUN=' + q(id) + ' DAMI_AGENT=' + q(`remote-${id}`),
    `R=${rootExpr(host)}/${q(repo)}`,
    `WT=${rootExpr(host)}/${q(`${repo}-runs`)}/${q(id)}`,
    `RUNDIR=${rootExpr(host)}/.runs/${q(id)}`,
    'mkdir -p "$RUNDIR" "$(dirname "$WT")"',
    `git -C "$R" worktree add -q -B ${q(branch)} "$WT" ${q(base)} >&2 || exit 90`,
    `printf %s ${q(b64)} | base64 -d > "$RUNDIR/prompt.md"`,
    'cd "$WT"',
    `( timeout ${Math.max(1, timeoutMinutes)}m ${agentLine} < "$RUNDIR/prompt.md" > "$RUNDIR/out.txt" 2> "$RUNDIR/err.txt" ) &`,
    'echo $! > "$RUNDIR/pid"',
    'wait $!; code=$?',
    write
      ? `if [ -n "$(git status --porcelain)" ]; then git add -A >&2 && git -c user.name=dami -c user.email=dami@localhost commit -q -m ${q(`dami run ${id} on ${host.name}`)} >&2; fi`
      : ':',
    '[ -s "$RUNDIR/reply.txt" ] && cat "$RUNDIR/reply.txt" || cat "$RUNDIR/out.txt"',
    'if [ "$code" != 0 ]; then tail -c 1500 "$RUNDIR/err.txt" >&2; fi',
    'exit $code',
  ].join('\n');
}

function stopRemote(host, id) {
  return runScript(host, [
    `P=$(cat ${rootExpr(host)}/.runs/${q(id)}/pid 2>/dev/null) || exit 0`,
    'pkill -TERM -P "$P" 2>/dev/null; kill -TERM "$P" 2>/dev/null; sleep 2; pkill -KILL -P "$P" 2>/dev/null; kill -KILL "$P" 2>/dev/null; exit 0',
  ].join('\n'), 30000);
}

function cleanupRemote(host, { repo, id, branch, baseRef }) {
  runScript(host, [
    `R=${rootExpr(host)}/${q(repo)}`,
    `git -C "$R" worktree remove --force ${rootExpr(host)}/${q(`${repo}-runs`)}/${q(id)} 2>/dev/null`,
    `git -C "$R" branch -D ${q(baseRef)} 2>/dev/null`,
    branch ? `git -C "$R" branch -D ${q(branch)} 2>/dev/null` : ':',
    `rm -rf ${rootExpr(host)}/.runs/${q(id)}`,
    'exit 0',
  ].join('\n'), 30000);
}

// Remote Control on the host: one tmux session per repo, sessions spawn on worktrees of the
// repo's copy there. The pane is read back so the caller sees the link or any prompt.
const rcSession = (repo) => `dami-rc-${repo}`.slice(0, 60);

function remoteControl(host, { action, repo, name, sha }) {
  const R = `${rootExpr(host)}/${q(repo)}`;
  const S = q(rcSession(repo));
  const pane = `tmux capture-pane -pt ${S} -S -40 2>/dev/null | sed '/^[[:space:]]*$/d' | tail -20`;
  const others = 'echo "--- other remote-control processes:"; pgrep -af "claude (rc|remote-control)" | grep -v "tmux" || echo none';
  let lines;
  if (action === 'stop') {
    lines = [`tmux kill-session -t ${S} 2>/dev/null && echo stopped || echo "not running"`];
  } else if (action === 'status') {
    lines = [`if tmux has-session -t ${S} 2>/dev/null; then echo running; ${pane}; else echo "not running"; fi`, others];
  } else {
    lines = [
      KIND_PATHS,
      'command -v tmux >/dev/null || { echo "tmux is not installed on this host" >&2; exit 2; }',
      'command -v claude >/dev/null || { echo "claude is not installed on this host" >&2; exit 2; }',
      `if tmux has-session -t ${S} 2>/dev/null; then echo "already running"; ${pane}; exit 0; fi`,
      // Move the copy to the commit just sent, unless someone left changes in it.
      `if [ -z "$(git -C ${R} status --porcelain)" ]; then git -C ${R} checkout -q --detach ${q(sha)}; else echo "left ${repo} as it was: it has uncommitted changes"; fi`,
      `tmux new-session -d -s ${S} -c ${R} ${q(`${KIND_PATHS}; exec claude remote-control --spawn worktree --name ${q(name)}`)}`,
      'for i in 1 2 3 4 5 6 7 8 9 10; do sleep 1',
      `  if tmux capture-pane -pt ${S} | grep -q "Trust"; then tmux send-keys -t ${S} y Enter; fi`,
      `  tmux capture-pane -pt ${S} | grep -qE "Connected|claude.ai/code" && break`,
      'done',
      'echo started',
      pane,
    ];
  }
  const r = runScript(host, lines.join('\n'), 60000);
  if (r.status !== 0) throw new Error((r.stderr || r.stdout).trim().slice(-600) || `ssh ${host.ssh} failed`);
  return { host: host.name, session: rcSession(repo), output: r.stdout.trim() };
}

module.exports = {
  addHost, cleanupRemote, fetchBack, getHost, probe, pushUp, q, readHosts, remoteControl, removeHost,
  repoName, runScriptFor, spawnScript, stopRemote,
};
