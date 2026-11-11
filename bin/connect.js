// damistack connect: walks a person through connecting a VPS or any Linux machine to the hub.
// Tailscale for the network, a dedicated key for ssh, Claude Code on the far side, then the
// hub's host list. Each step checks first and skips what is already done, so it can be rerun.
// The one password, if any, is typed into ssh itself, never into this script.
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const hosts = require('../mcp/hosts');

const color = process.env.FORCE_COLOR ? process.env.FORCE_COLOR !== '0' : (process.stdout.isTTY && !process.env.NO_COLOR);
const paint = (code) => (text) => (color ? `\x1b[${code}m${text}\x1b[0m` : text);
const bold = paint('1');
const dim = paint('2');
const green = paint('32');
const yellow = paint('33');
const red = paint('31');
const accent = paint('38;5;209');

const say = (text = '') => console.log(text ? `  ${text}` : '');
const ok = (text) => say(`${green('✓')} ${text}`);
const warn = (text) => say(`${yellow('!')} ${text}`);
const bad = (text) => say(`${red('✗')} ${text}`);
const cmd = (text) => say(`    ${accent(text)}`);

const STEPS = ['Local tools', 'Find the machine', 'Key', 'Let the key in', 'ssh shortcut', 'Lock it down', 'Claude Code there', 'Join the hub'];
let stepNo = 0;
function step() {
  stepNo += 1;
  say();
  say(`${bold(`${stepNo}/${STEPS.length}  ${STEPS[stepNo - 1]}`)}`);
}

function parseArgs(argv) {
  const opts = { name: null, yes: false, harden: null, rc: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => { i += 1; return argv[i]; };
    if (a === '--address') opts.address = next();
    else if (a === '--user') opts.user = next();
    else if (a === '--key') opts.key = next();
    else if (a === '--yes' || a === '-y') opts.yes = true;
    else if (a === '--harden') opts.harden = true;
    else if (a === '--no-harden') opts.harden = false;
    else if (a === '--rc') opts.rc = true;
    else if (a === '--no-rc') opts.rc = false;
    else if (!a.startsWith('-') && !opts.name) opts.name = a;
    else throw new Error(`Unknown option ${a}`);
  }
  return opts;
}

let rl = null;
function ask(question, fallback = '') {
  if (!process.stdin.isTTY) return Promise.resolve(fallback);
  rl = rl || readline.createInterface({ input: process.stdin, output: process.stdout });
  const hint = fallback ? dim(` [${fallback}]`) : '';
  return new Promise((resolve) => rl.question(`  ${question}${hint} `, (answer) => resolve(answer.trim() || fallback)));
}
async function yes(question, opts, preset = null, fallback = false) {
  if (preset !== null) return preset;
  if (opts.yes) return fallback;
  if (!process.stdin.isTTY) return fallback;
  const answer = (await ask(`${question} ${dim(fallback ? '[Y/n]' : '[y/N]')}`)).toLowerCase();
  return answer ? answer.startsWith('y') : fallback;
}
// While ssh owns the terminal for a password, this script must not hold stdin.
function releaseTerminal() {
  if (rl) { rl.close(); rl = null; }
}

const run = (file, args, extra = {}) => spawnSync(file, args, { encoding: 'utf8', windowsHide: true, ...extra });
const has = (file) => {
  const r = run(file, ['-V']);
  return !r.error;
};

function tailscaleBin() {
  const mac = '/Applications/Tailscale.app/Contents/MacOS/Tailscale';
  if (!run('tailscale', ['version']).error) return 'tailscale';
  if (process.platform === 'darwin' && fs.existsSync(mac)) return mac;
  return null;
}

function tailnet(bin) {
  const r = run(bin, ['status', '--json']);
  if (r.status !== 0) return null;
  try {
    const j = JSON.parse(r.stdout);
    if (j.BackendState !== 'Running') return null;
    const peers = Object.values(j.Peer || {}).map((p) => ({
      name: p.HostName, os: p.OS, online: p.Online, ip: (p.TailscaleIPs || []).find((ip) => ip.includes('.')),
    }));
    return { self: j.Self && j.Self.HostName, peers };
  } catch {
    return null;
  }
}

const sshDir = () => path.join(os.homedir(), '.ssh');
const sshConfigFile = () => path.join(sshDir(), 'config');
const tilde = (p) => p.replace(os.homedir(), '~').replace(/\\/g, '/');

function configHas(name) {
  if (!fs.existsSync(sshConfigFile())) return false;
  return fs.readFileSync(sshConfigFile(), 'utf8').split(/\r?\n/).some((line) => {
    const m = /^\s*Host\s+(.+)$/i.exec(line);
    return m && m[1].split(/\s+/).includes(name);
  });
}

// ssh -G prints what ssh would use for a target, after reading the config.
function resolved(target) {
  const r = run('ssh', ['-G', target]);
  if (r.status !== 0) return {};
  const get = (k) => ((r.stdout.match(new RegExp(`^${k} (.+)$`, 'm')) || [])[1] || '').trim();
  return { hostname: get('hostname'), user: get('user'), identity: get('identityfile') };
}

// Key-only login, no prompts. target is an alias or user@address.
function keyLogin(target, key) {
  const args = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'StrictHostKeyChecking=accept-new'];
  if (key) args.push('-i', key, '-o', 'IdentitiesOnly=yes');
  const r = run('ssh', [...args, target, 'echo dami-ok'], { timeout: 30000 });
  return r.status === 0 && r.stdout.includes('dami-ok');
}

function remote(name, script, timeoutMs = 120000) {
  const r = run('ssh', ['-T', '-o', 'BatchMode=yes', name, 'bash', '-s'], { input: script, timeout: timeoutMs });
  return { status: r.error ? 1 : r.status, out: (r.stdout || '').trim(), err: (r.stderr || (r.error && r.error.message) || '').trim() };
}

const PATHS = 'export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:/usr/local/bin:$PATH"';
// Root, or a user with password-less sudo, can change system settings.
const SUDO = 'if [ "$(id -u)" = 0 ]; then S=""; elif sudo -n true 2>/dev/null; then S="sudo -n"; else S=none; fi';

async function connect(argv) {
  const opts = parseArgs(argv);
  const todo = [];
  say();
  say(`${accent(bold('dami stack'))} ${dim('connect a machine')}`);
  say(dim('Tailscale for the network, a key for ssh, Claude Code on the far side.'));
  say(dim('Nothing changes on either machine without a yes from you.'));

  // 1. Local tools.
  step();
  if (!has('ssh') || !has('ssh-keygen')) {
    bad('OpenSSH is missing. Install the OpenSSH client, then run this again.');
    return 1;
  }
  ok('ssh and ssh-keygen');
  const ts = tailscaleBin();
  const net = ts && tailnet(ts);
  if (net) ok(`Tailscale is up on ${net.self}`);
  else if (ts) warn('Tailscale is installed but not signed in. Run `tailscale up`, or carry on over the public address.');
  else warn('Tailscale is not installed. It keeps ssh off the public internet: https://tailscale.com/download');

  // 2. Find the machine.
  step();
  let name = opts.name;
  if (!name) name = (await ask('A short name for this machine, used as its ssh alias:', 'vps')).toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(name)) { bad('Use lower case letters, digits and hyphens.'); return 1; }

  let address = opts.address;
  let user = opts.user;
  const known = configHas(name);
  if (known && !address) {
    const r = resolved(name);
    ok(`${name} is already in ${tilde(sshConfigFile())}: ${r.user}@${r.hostname}`);
    address = r.hostname;
    user = r.user;
  }
  if (!address && net) {
    const peers = net.peers.filter((p) => p.ip && p.os === 'linux');
    if (peers.length) {
      say('Linux machines on your tailnet:');
      peers.forEach((p, i) => say(`  ${bold(String(i + 1))}. ${p.name}  ${dim(`${p.ip}${p.online ? '' : ', offline'}`)}`));
      say(`  ${bold('0')}. Not listed: it isn't on Tailscale yet`);
      const pick = Number(await ask('Which one?', '1'));
      if (pick > 0 && peers[pick - 1]) address = peers[pick - 1].ip;
    }
  }
  if (!address) {
    say('Give the address you reach it on now, usually the public IP from your provider.');
    address = await ask('Address:');
    if (!address) { bad('No address given.'); return 1; }
    if (ts && net && await yes('Put it on your tailnet first, so ssh can stay off the public internet?', opts, null, false)) {
      user = user || await ask('User to log in as:', 'root');
      say('ssh will ask for the password once. Then Tailscale prints a link: open it and approve the machine.');
      releaseTerminal();
      const r = spawnSync('ssh', ['-t', '-o', 'StrictHostKeyChecking=accept-new', `${user}@${address}`,
        'curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up'], { stdio: 'inherit' });
      if (r.status === 0) {
        const after = tailnet(ts);
        const fresh = after && after.peers.find((p) => p.os === 'linux' && p.ip && !net.peers.some((o) => o.ip === p.ip));
        if (fresh) {
          ok(`${fresh.name} joined your tailnet at ${fresh.ip}`);
          address = fresh.ip;
        } else warn('It did not show up on the tailnet yet. Carrying on with the public address.');
      } else warn('Tailscale setup did not finish. Carrying on with the public address.');
    }
  }
  if (!user) user = await ask('User to log in as:', 'root');
  const direct = `${user}@${address}`;
  ok(`Target: ${direct}${address.startsWith('100.') ? dim('  (Tailscale)') : ''}`);

  // 3. Key.
  step();
  let key = opts.key && path.resolve(opts.key.replace(/^~/, os.homedir()));
  if (!key && known) {
    const r = resolved(name);
    const id = r.identity && r.identity.replace(/^~/, os.homedir());
    if (id && fs.existsSync(id)) key = id;
  }
  key = key || path.join(sshDir(), `dami_${name}`);
  if (fs.existsSync(key)) {
    ok(`Using ${tilde(key)}`);
  } else {
    fs.mkdirSync(sshDir(), { recursive: true });
    const r = run('ssh-keygen', ['-t', 'ed25519', '-N', '', '-C', `dami-${name}`, '-f', key]);
    if (r.status !== 0) { bad(`ssh-keygen failed: ${r.stderr.trim()}`); return 1; }
    ok(`Made ${tilde(key)}, a key just for this machine`);
  }
  if (!fs.existsSync(`${key}.pub`)) { bad(`${tilde(key)}.pub is missing.`); return 1; }

  // 4. Let the key in.
  step();
  if (keyLogin(direct, key)) {
    ok('The key already logs in, no password needed');
  } else {
    say('The machine does not know this key yet. ssh will ask for its password once, to add the key.');
    say(dim('You type it into ssh itself. dami stack never sees it.'));
    if (!await yes('Add the key now?', opts, null, true)) { bad('Stopped before adding the key.'); return 1; }
    releaseTerminal();
    const r = spawnSync('ssh', ['-o', 'StrictHostKeyChecking=accept-new', '-o', 'PubkeyAuthentication=no', direct,
      'umask 077; mkdir -p ~/.ssh; cat >> ~/.ssh/authorized_keys'], {
      input: fs.readFileSync(`${key}.pub`, 'utf8'), stdio: ['pipe', 'inherit', 'inherit'],
    });
    if (r.status !== 0 || !keyLogin(direct, key)) {
      bad('The key still does not log in. Check the user and password, and that the server allows key login.');
      return 1;
    }
    ok('Key added. Logging in no longer needs a password');
  }

  // 5. ssh shortcut.
  step();
  if (known) {
    ok(`Keeping the existing ${name} entry in ${tilde(sshConfigFile())}`);
  } else {
    if (fs.existsSync(sshConfigFile())) {
      const backup = `${sshConfigFile()}.bak-dami-${new Date().toISOString().slice(0, 10)}`;
      if (!fs.existsSync(backup)) fs.copyFileSync(sshConfigFile(), backup);
    }
    const block = [`Host ${name}`, `    HostName ${address}`, `    User ${user}`, `    IdentityFile ${tilde(key)}`, '    IdentitiesOnly yes', ''];
    const before = fs.existsSync(sshConfigFile()) ? fs.readFileSync(sshConfigFile(), 'utf8') : '';
    fs.writeFileSync(sshConfigFile(), `${before}${before && !before.endsWith('\n') ? '\n' : ''}${before ? '\n' : ''}${block.join('\n')}`);
    ok(`Added ${bold(name)} to ${tilde(sshConfigFile())}`);
  }
  if (!keyLogin(name)) { bad(`ssh ${name} does not log in with the key. Look at the ${name} entry in ${tilde(sshConfigFile())}.`); return 1; }
  ok(`${accent(`ssh ${name}`)} works with no password`);

  // 6. Lock it down.
  step();
  const sshd = remote(name, [SUDO, 'echo "sudo=$S"', '$([ "$S" = none ] && echo true || echo "$S") /usr/sbin/sshd -T 2>/dev/null | grep -Ei "^(passwordauthentication|kbdinteractiveauthentication) "', '[ "$S" != none ] && $S ufw status 2>/dev/null | grep -q "^Status: active" && echo ufw=active',
    '[ "$S" != none ] && $S ufw status 2>/dev/null | grep -E "^(22|OpenSSH)[ /]" | grep -vq tailscale0 && echo publicssh=yes'].join('\n'));
  // Without an active firewall, assume the public address takes ssh. A provider firewall can't be seen from here.
  const publicSsh = !address.startsWith('100.') || !/ufw=active/.test(sshd.out) || /publicssh=yes/.test(sshd.out);
  const canSudo = !/sudo=none/.test(sshd.out);
  const passwordsOn = /passwordauthentication yes|kbdinteractiveauthentication yes/i.test(sshd.out);
  if (!canSudo) {
    warn('This user cannot change system settings without a password, so the server was left as it is.');
    if (passwordsOn) todo.push(`Turn off password login on ${name}: set PasswordAuthentication no in /etc/ssh/sshd_config.d/00-dami.conf`);
  } else if (!passwordsOn) {
    ok('The server already refuses password logins');
  } else {
    say(publicSsh
      ? 'The server still accepts passwords, so anyone who can reach it can keep guessing them.'
      : 'The server still accepts passwords. Only your tailnet can reach ssh, but keys alone are safer.');
    if (await yes('Turn password login off? Your key keeps working.', opts, opts.harden, false)) {
      const r = remote(name, [
        SUDO, 'set -e',
        'printf "PasswordAuthentication no\\nKbdInteractiveAuthentication no\\n" | $S tee /etc/ssh/sshd_config.d/00-dami.conf >/dev/null',
        '$S /usr/sbin/sshd -t',
        '$S systemctl reload ssh 2>/dev/null || $S systemctl reload sshd',
      ].join('\n'));
      if (r.status === 0 && keyLogin(name)) ok('Password login is off, and the key still works');
      else {
        bad(`Could not change it: ${r.err.slice(-300)}`);
        todo.push(`Turn off password login on ${name} by hand`);
      }
    } else todo.push(`Password login is still on for ${name}`);
  }
  if (address.startsWith('100.') && /publicssh=yes/.test(sshd.out)) {
    say(dim('The firewall still lets ssh in from the internet. To allow it only over Tailscale:'));
    cmd('sudo ufw allow in on tailscale0 && sudo ufw delete allow OpenSSH');
  } else if (address.startsWith('100.') && /ufw=active/.test(sshd.out)) {
    ok('The firewall only lets ssh in over Tailscale');
  }

  // 7. Claude Code there.
  step();
  let facts = hosts.probe({ name, ssh: name });
  if (facts.kinds.includes('claude')) {
    ok('Claude Code is installed');
  } else if (await yes('Claude Code is not installed there. Install it now?', opts, null, true)) {
    say(dim('Running the official installer from claude.ai on the machine...'));
    const r = remote(name, `${PATHS}\ncurl -fsSL https://claude.ai/install.sh | bash`, 600000);
    facts = hosts.probe({ name, ssh: name });
    if (facts.kinds.includes('claude')) ok('Claude Code installed');
    else { bad(`The install did not finish: ${r.err.slice(-300)}`); todo.push(`Install Claude Code on ${name}`); }
  } else todo.push(`Install Claude Code on ${name}`);

  if (facts.kinds.includes('claude')) {
    const status = remote(name, `${PATHS}\nclaude auth status --json`);
    let signedIn = false;
    try { signedIn = JSON.parse(status.out).loggedIn === true; } catch { /* not signed in, or an old version */ }
    if (signedIn) {
      ok('Claude Code is signed in there');
    } else {
      say('Claude Code needs signing in there. It prints a link: open it, approve, and paste the code back.');
      if (await yes('Sign in now?', opts, null, true)) {
        releaseTerminal();
        spawnSync('ssh', ['-t', name, `${PATHS}; claude auth login`], { stdio: 'inherit' });
        const again = remote(name, `${PATHS}\nclaude auth status --json`);
        try { signedIn = JSON.parse(again.out).loggedIn === true; } catch { /* still not */ }
        if (signedIn) ok('Signed in');
        else todo.push(`Sign Claude Code in on ${name}: ssh ${name}, then claude auth login`);
      } else todo.push(`Sign Claude Code in on ${name}: ssh ${name}, then claude auth login`);
    }
  }
  if (!facts.tmux) todo.push(`Install tmux on ${name} to run Remote Control there`);

  // 8. Join the hub.
  step();
  let added;
  try {
    added = hosts.addHost(name, name);
  } catch (err) {
    bad(err.message);
    say(`Fix that, then run ${accent(`damistack connect ${name}`)} again. Every step done so far is skipped.`);
    releaseTerminal();
    return 1;
  }
  ok(`${bold(name)} can now take runs: ${added.kinds.join(', ') || 'no agents yet'}`);
  const inRepo = run('git', ['rev-parse', '--show-toplevel']).status === 0;
  if (inRepo && facts.tmux && added.kinds.includes('claude')
    && await yes(`Start Claude Remote Control on ${name} for this repo?`, opts, opts.rc, false)) {
    const { handlers } = require('../mcp/tools');
    const { hubDir } = require('../mcp/store');
    const cwd = process.cwd();
    const r = handlers.team_host({ cwd, dir: hubDir(cwd) }, { action: 'remote_control', name, control: 'start' });
    const link = (r.output.match(/https:\/\/claude\.ai\/code\S*/) || [])[0];
    ok(link ? `Remote Control is up: ${link}` : 'Remote Control started');
  }

  say();
  say(bold('Done.'));
  say(`Agents can now hand work to ${name}: ${accent(`team_ask { host: "${name}" }`)}`);
  cmd(`damistack host rc ${name} start     ${dim('Remote Control there, for the repo you run it in')}`);
  cmd(`ssh ${name}                         ${dim('a shell there, no password')}`);
  if (todo.length) {
    say();
    say(bold('Left for you'));
    todo.forEach((t) => warn(t));
  }
  say();
  releaseTerminal();
  return 0;
}

module.exports = { connect };
