---
name: crew-lead
description: "Use when a ready chart, several cards or a long-running goal should go to a team of agents. Merging, opening PRs and outward steps need OK."
user-invocable: false
---
# Crew lead
Gate: get the user's OK before pushing, opening or readying a PR, merging into a shared branch, writing to the tracker, starting anything that outlives this run, or changing your own instructions (G1, G2, G3, G6). See gates.md in the skill house-rules.
Job: Own a graph or goal and get it finished by a team at the highest safe concurrency.
Takes: a chart, several cards, or an agreed goal.   Gives: one integration branch with everything resolved, and a closing report.
Team moves: all of them. Tools for each are in the file `levels.md` in the skill `house-rules`.

For a long-running goal, follow the file `standing-goal.md` in this skill, and run the steps below for each large chunk.

## Steps

1. **Start.** Detect the level, read the chart, and say level and team once: `Level: deck, spawn on, kinds claude, codex.` On deck, say the spawn sum: 8 cards need 16 units, plus 4 for the close, of 24.
2. **Take one OK.** List every outward step the run may need: pushing the branch, a draft PR, the final PR, closing tracker cards. Ask once, for the whole list. Local work carries on while the answer waits, and outward steps hold until it comes. If the list grows, ask again.
3. **Make the integration branch** locally and check it out in the tree the team starts from. If the chart is thin on code detail, send one scout first and file its findings in bench `notes/` for later packets.
4. **Find the wave.** The wave is every card whose `needs` have landed and been committed. Put those cards on the board and no others (see The wave rule). Two cards that touch the same files land one after the other, so hold the second back, or expect a merge.
5. **Dispatch each card** by type. `slice`, `try` and `chore` go to workers, `probe` to a scout. A `decide` card is yours, since only the lead interviews: use the skill `question-tree`. Each gets one packet from the skill `baton-pass`, with:
   - `base` at the integration tip, and `Asked` and `Limits` carried unchanged
   - the card's `Accept`, its agreed seam, its `touches`, and a budget: 30 minutes unless the card says more
   - `Use` naming the block that resolves its type, such as `failing-test-first`, plus `finish-line`

   Leave the agent kind unset unless it matters, so deck routes by plan headroom. A card with several plausible approaches, cheap to compare, goes through the route `race`.
6. **Receive.** A worker ends with a report and its code. Every claim in the report is `[reported]`. Cross gates in `Needs OK` yourself. Send glossary candidates in `Learned` to the skill `shared-words`, and pin traps with the remember move.
7. **Check.** Dispatched work goes through the route `cross-check`, by a different agent kind where one exists. The checker runs checker mode from the skill `finish-line`.
8. **Land.** Once the check passes, land the card and commit on the integration branch, with the card id first: `c3: per-IP rate limit`. Run the card's `Accept` checks there, which makes them `[observed]`. If the tracker closes cards through PRs, or the user wants a PR, open a draft after the first landing, because an empty branch can't hold one. Then go straight back to step 4. A landing can free cards, and no ready card stays idle.
9. **Close.** When every card has landed:
   1. Use the skill `finish-line` over the whole branch, with a checker of another kind.
   2. Give all its fixes to one fresh worker, then check again.
   3. Use the skill `merge-case` to open or ready the PR, and close cards the tracker's way, both under the OK.
   4. List the worktrees left for the user to discard. On deck that is `d` in the Tasks pane, the user's control. Elsewhere it is `git worktree remove`.
   5. Write the closing report.

## The wave rule

The board holds the current wave only. The full graph stays in the chart.

A worktree starts from the last commit, and the scheduler starts a ready task immediately. A blocker's task counts as done before its code has landed, so a dependent created with `deps` could start without that code. Create a card's task only once its blockers have landed and been committed. Use `deps` only between tasks with no code dependency.

On deck, dispatch like this:

```
agent.spawn {title, brief: <packet>, isolate: true, review: "other", explicit_done: true, expect, done_when: <Accept>}
task.update {id: <the task it returns>, budget_minutes: 30}
```

Spawn first and then set the budget. `task.create` carries the budget, but the scheduler takes a ready task at once, and its worker gets no `explicit_done`.

## At each level

The steps stay the same. These parts change.

| Level | Board | Start a card | Check | Land |
|---|---|---|---|---|
| deck | Deck tasks, current wave only | Dispatch as above. The worker's report and capsule return through `task.done` | Deck reviewer of another kind. The packet's `Use` reaches it through the brief | Verify and apply the capsule, or preview and resolve a merge, then commit |
| host | bench `board.md` | Subagent on its own worktree and branch, packet as prompt, `return: final message` | Other-kind CLI headless, else a fresh subagent | Merge the branch |
| herdr | bench `board.md` | One workspace and agent per card, on its own worktree. Watch with the see team move | Other-kind workspace | Merge the branch |
| solo | bench `board.md` | Nothing to start. Work cards in graph order on one branch | Clean second pass, labelled `self`. Say no independent check ran | Already there |

On host and herdr, the packet tells the worker to confirm `base`, rebase if it's wrong, and merge the integration tip before reporting. Budgets there are stop conditions in the brief, and nothing enforces them. Deck with orchestration off keeps its board, and spawning alone moves to host or herdr.

## Limits

Each worker and each reviewer costs one spawn unit against `max_work`, so a reviewed slice costs two, and each round of changes adds one for its new reviewer. Keep four units for the close. Before a wave that won't fit, tell the user what has landed and what remains. Their next message or Continue resets the count. Work through tasks rather than messages, because task results aren't hops.

A refusal or a blocked task comes back to the lead with its reason.

| Deck says | Do |
|---|---|
| Too many subagents | Wait for a result, then dispatch again. This isn't a failure |
| Thread paused or held | Dispatch nothing. Reviews wait too. Report what remains and wait for the user |
| Over budget, blocked | Its agents were stopped mid-turn. Split the card, or re-dispatch with more budget. The clock runs through review, so allow for that. Only the user retries in place |
| Review did not converge | Two rounds are spent. Show the user the notes and leave the retry to them |
| Ended its turn without `task.done` | Read its last reply, then steer it or re-dispatch with a sharper packet |
| Failed for good | Deck has already retried it. Fix the packet or reslice the card |
| Was not reviewed | Only one kind is installed. Take the next rung of the check ladder before landing |
| Orchestration is off | Say once that `o` in the Tasks pane turns it on, and spawn through host or herdr. The switch is the user's |

Landing on deck follows the session's mode: ask mode puts each apply to the user, and plan mode refuses it. A lead with a lead above it sends gates up under `Needs OK`.

## Done when

- Every chart card is landed and committed on the integration branch, dropped with a reason, or named as blocked with its reason.
- Each commit names its card, and no card started before its blockers were committed.
- Each landed card has a check result with its `independent` value, and its `Accept` checks ran on the integration branch.
- The whole-branch report from the skill `finish-line` exists, and its fixes came from one worker and were checked again.
- Every outward step ran under an OK, and any step without one is listed as left.
- The worktrees left for the user are listed.
- The closing report answers every `Asked` item with met, partly or not, keeps its labels, names the level, and on deck gives the units spent.
