# Follow-through

Carry an open PR to merge-ready, one pass at a time.

## Mode

Say which one before the first pass:

- `drive`: repeat passes until the merge gate below holds.
- `threads`: review threads only.
- `check`: one status pass. Change nothing.

## Each pass

Go in this order: conflicts, then threads, then CI.

1. **Conflicts.** On `behind` or `dirty`, report which branch needs a rebase onto which base. Never rebase or force-push on your own. Force-push is G2, and only an explicit request clears it.
2. **Threads.** Triage every unresolved thread. For review bodies and bot summaries, only those on the current head. Check each against the source, then class it:
   - fix: change the code, push, then reply citing the commit sha.
   - dismiss: reply with a concrete disproof, a file:line or a command and its output.
   - ask: anything touching billing, auth, data loss, security or migrations goes to the user, whatever the reviewer says.

   Bots, CodeRabbit included, are advisory. Never wait for a bot to finish reviewing; its posted findings still need fix or dismiss. Hold the PR's scope: decline unneeded tests, guards and compatibility shims, and list them as follow-ups.
3. **CI.** Read the failing log first. A check that looks flaky gets one rerun, `gh run rerun <id> --failed`. A second failure is a real failure: fix it.

Push the fix before the reply, so the reply can cite its sha. Replies use the comment shape in the file `artifacts.md` in the skill `house-rules`. Replying and resolving are G1: one OK covers them for the run, or a standing prefs line such as `ok: G1 reply to and resolve review threads on my own PRs`.

## Waiting

Wait with `scripts/pr-watch.js` in this skill, by its absolute path. Write no polling loop of your own.

- Claude Code: run `node <path>/pr-watch.js <pr> --max-seconds 0` under the Monitor tool, so each event line wakes you.
- Elsewhere: run it in Bash with its 240 s default, and run it again on exit 3.

Exit 0: the `--until` condition holds, or the PR merged. 1: an event needs action. 2: bad input, a gh error, or another watcher already holds the PR. 3: nothing new. Start it again after each push. A wake that needs nothing ends the turn silently, with no "still waiting".

## Merge gate

All of these hold on the latest head:

- The proof covers the diff.
- Required checks are green.
- Every bot finding is fixed, or dismissed with a reason.
- No changes-requested review stands.
- The branch is not BEHIND or DIRTY.
- You ran `git fetch` and checked again right before.

Merge only under an explicit merge request: merge is G2 and can't be standing. Otherwise stop at ready and print the raw PR URL alone on a line.

Every turn that reports ends in the status shape from the file `artifacts.md` in the skill `house-rules`; a wake that needs nothing ends silently.
