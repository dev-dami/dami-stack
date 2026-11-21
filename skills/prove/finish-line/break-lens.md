# Break lens

A run-proven review: adversaries try to break the change, and a finding counts only once the lead reproduces it.

## Frame

Scope is what the user named, else the diff from the merge-base through the working tree. The intent is the `Asked` list. If it is unclear and the user is here, ask; otherwise state what you assumed.

## Dispatch

Send adversaries through the race move: 3 at hub, 2 at host as `dami:checker`, 1 clean pass at solo labelled `self`. Take other kinds first, per the check ladder in the file `levels.md` in the skill `house-rules`. Each works in its own isolated worktree with the scope's uncommitted changes copied in, may run anything there, and commits nothing. The packet holds the scope, `Asked`, and this brief:

> Try to break this change against the Asked intent. Prove each finding with a run against the real code: a failing test, a repro script, a command. Report each as `B1 [blocker|should|nit] <cmd> -> got X, intent needs Y`, with the output it printed. Leave out style, naming, and risks that need some future change to matter. Leave out anything you didn't run. No findings is a valid answer.

## Verify

Re-run every finding's command yourself. One that reproduces and breaks the intent becomes `[observed]`. Findings with one root cause merge into one, naming each adversary that found it. A finding nobody re-ran stays `[reported]` and blocks nothing. The verdict lists every verified finding from all adversaries, not one adversary's list, and gives each adversary's count of dropped findings with the reason.

## Safety fact

For a risky diff, or a small one nobody trusts yet, name the one fact the change is safe because of; proving it clears most cases at once. Push it up this ladder and say where it stopped: said so, pointed at the line, walked the bad case, ran it, reproduced it in the app. Reach at least ran it: a script that calls the real code and fails loudly if the fact is false.

Look where grep can't: the library's source at the pinned version, wire formats, DB columns, flags, other readers of the same bytes. List cleared risks apart from confirmed ones, and name the cheapest test that would catch the real bug before merge.

## Loop

- The user asked for a review: stop at the report.
- Self-started, or under a standing OK: break, fix with fresh fixers, break again, until no verified finding is left or 2 rounds have run. Then go to the user.

In every round:

- A checker that timed out or sent no report has not approved.
- Compare `git diff --shortstat` with the last round's. If review grew the diff, cut it back before re-checking.
- Never agree just to end the loop.
- Go past 2 rounds only for security, auth, data loss or concurrency.

## Report

The report shape from the file `artifacts.md` in the skill `house-rules`, holding: the intent; `## Break findings`, each verified B-line with its output and finders, or "No verified findings"; the safety fact with its rung, or `unproven`; cleared risks; the pre-merge test; dropped counts.

## Done when

- Every verdict finding is `[observed]` from the lead's re-run, with command, output and what the intent needs, or listed `[reported]` as non-blocking.
- Shared root causes are merged, and no finding is style, naming or a future change.
- For a risky or distrusted diff, the safety fact is named with its rung, at least ran it, or marked `unproven`.
- A review the user asked for changed no files; a loop stopped at zero verified findings or 2 rounds, or names the reason it went on.
