# Git safety

A mechanical stop on agents pushing or throwing work away, whatever they intended. `scripts/git-safety.js` in this skill is a pre-execution hook, Node with built-ins only.

## What it does

Reads the tool call as JSON on stdin and inspects `tool_input.command` for any tool that has one, so Bash and PowerShell both count. Input with no command, or that isn't JSON, passes.

| Blocks | Examples |
|---|---|
| All pushes | `git push`, `git -C repo push`, `powershell -Command "git push"` |
| Hard resets | `git reset --hard HEAD~1` |
| Forced cleans | `git clean -fd`, `git clean --force` |
| Forced branch deletion | `git branch -D x`, `git branch -d -f x` |
| Whole-tree checkout or restore | `git checkout .`, `git checkout -- .`, `git checkout -f main`, `git restore .` |

It allows `git status`, `git checkout main`, `git checkout -- one-file`, `git branch -d x`, `git clean -n`, and text that merely mentions a command, such as a commit message.

A block exits 2 and puts a reason on stderr saying the user forbids it. Claude Code reads that as a refusal.

It is a guard, not a sandbox. Scripts in files, git aliases and encoded commands get past it. Say so at install.

## Steps

1. Ask the scope, with project as the recommendation: project (this repo) or global (every repo for this user).
2. Show the settings change and get the OK.
3. Copy the script.

   | Scope | Copy to | Register in |
   |---|---|---|
   | project | `.claude/hooks/git-safety.js` | `.claude/settings.json` |
   | global | `~/.claude/hooks/git-safety.js` | `~/.claude/settings.json` |

4. Add this entry, merged into any `PreToolUse` list already there. Expand `~` yourself to an absolute path, since cmd.exe won't. Project scope uses `$CLAUDE_PROJECT_DIR`.

   ```json
   {
     "hooks": {
       "PreToolUse": [
         {
           "matcher": "Bash|PowerShell",
           "hooks": [{ "type": "command", "command": "node \"<absolute path>/git-safety.js\"" }]
         }
       ]
     }
   }
   ```

5. Test the script alone. This line works in cmd.exe, PowerShell and Git Bash, and should print the block reason and exit 2:

   ```
   node -e "console.log(JSON.stringify({tool_input:{command:'git push'}}))" | node <path>/git-safety.js
   ```

   That result is `[simulated]`, because the host wasn't involved.
6. Test through the host with a sample that does nothing if the hook fails: `git push --dry-run origin refs/heads/no-such-branch`. A block here is the proof. If the host loaded its settings earlier and the command went through, the proof is still open: ask the user to start a new session and run it there.
7. Confirm `git status` still runs.
8. Offer to adjust the patterns, for example allowing pushes to one branch.

## After install

The hook has no view of gates. An agent holding an OK to push is still blocked, because that is what the user installed. The user pushes by hand, or changes the hook. Never add a bypass an agent could reach, such as an environment variable.

## Other hosts

Hook support on Codex and OpenCode is `[untested]`. At install, check that host's current docs or `--help`. Wire it up if there is a pre-execution hook that can refuse a call, and tell the user plainly which hosts are covered and which are not.

## Finished when

The block was observed on a real sample through the host, `git status` still works, and the report names the hosts not covered.
