# Deck adapter

This file applies only inside a Deck thread: you have `search` and `execute` tools from an MCP server named `deck`, and `execute {op:"thread.roster"}` answers. Everywhere else, ignore it.

Inside Deck it overrides the move table in the file `levels.md` in the skill `house-rules`, and it adds the Deck side of every block below. Blocks stay the same otherwise. Gates and finish conditions only get stricter here.

Deck calls go through `execute {op, args}`. `search {query}` finds ops and skills. `skills.read {name, file?}` reads any skill, and also works across kinds.

Say it once when a block first uses a team move: `Level: deck, spawn on, kinds claude, codex.` Artifact headers read `claude (lead) @ deck`.

## Team moves

| Move | Deck |
|---|---|
| see team | `thread.roster`, `peers.list`. Also shows each agent's context use |
| board | `task.create`, `task.list`, `task.update` |
| dispatch | `agent.spawn {brief, title, kind, model, effort, task, isolate, expect, done_when, explicit_done, review}`, or `thread.send {to, message, new_task, task, expect, done_when, explicit_done, capsule}` for an existing member |
| isolate | `isolate: true` |
| claim files | `lease.acquire {paths, exclusive, minutes, reason}`, `lease.release`, `lease.list` |
| hand over code | `sub.patch.capture {task}`, then `task.done {id, result, capsule}` or `thread.send {capsule}` |
| land | `sub.patch.verify`, `sub.patch.apply`, or `sub.merge.preview` then `sub.merge.resolve {strategy}`; then commit |
| race | `task.race {brief, agents, judge, review}` |
| check | `review: "other"` on task, spawn or race; reviewer answers `review.approve {id, note}` or `review.changes {id, notes}` |
| steer | `task.steer {id, message}` |
| remember | `memory.add {text, paths, lines}`, `memory.read`, `memory.drop` |
| budget | `budget_tokens`, `budget_usd`, `budget_minutes` on `task.create` or `task.update`; `agent.spawn` takes none, so spawn and then `task.update` the task it returns; `kind` left empty routes by plan headroom |
| look back | `history.threads`, `history.search`, `history.read`, `skills.used` |
| other machine | `task.contract {peer, brief, title}`, `sub.capsule.publish`, `sub.capsule.fetch`, `team.read`, `peers.status` |

Other kinds: use `thread.roster` and `review: other`.

Check ladder: Deck `review: "other"` sits above every rung in `levels.md`. Its `independent` value is `other-kind`. `claude -p` as a headless form is confirmed by the Deck docs.

## Limits

Plan around these.

| Limit | Value | Consequence |
|---|---|---|
| Task brief, result | 4,000 chars, silently clipped | Packets under 3,500 |
| One op's output | 20 KB | Narrow reads |
| Spawn budget | `max_work` 24 per user message, worker and reviewer each count | About 10 reviewed slices, then the thread pauses until the user writes |
| Agent-to-agent hops | 6 | Use tasks, whose results aren't hops. Avoid message ping-pong |
| Parallel | `max_parallel` 3, `max_children` 4, `max_subagents` 12, `max_depth` 3 | A refusal means wait, not fail |
| Review | 2 rounds, then blocked for the user | No retry loops |
| Race | 2 to 6 entries, needs git, user keeps one | An agent can't keep an entry |
| Lease | 15 minutes default, 2 hours max | Renew on long work |
| Worktree | Starts from the repo's last commit | See The wave rule in the skill `crew-lead` |
| Pinned note | 2 KB, 500 per repo | Short traps, not docs |

`maxTaskText` is the 4,000 limit. Deck clips task briefs and results there without warning, and adds a placement note.

## Orchestration off

The board, leases, memory, capsules and `thread.send` to existing members all work. `agent.spawn` and `task.race` are refused with "orchestration is off". An existing member still receives a message and capsule.

Say once that `o` in the Tasks pane turns it on, then use whichever of hub, host or herdr is here, for spawning only. The board stays on Deck. The user controls this switch, so never try to work around it.

## Tasks pane keys

Both are the user's controls.

- `o`: turn orchestration on.
- `d`: discard a worktree. In the skill `crew-lead`'s close, list the worktrees left, and the user discards them here.

## Dispatch and the wave rule

Why the rule is strict here: the scheduler starts a ready task immediately, and a blocker's task counts as done before its code has landed. A dependent created with `deps` could start without that code. Create a card's task only once its blockers have landed and been committed. Use `deps` only between tasks with no code dependency.

Dispatch like this:

```
agent.spawn {title, brief: <packet>, isolate: true, review: "other", explicit_done: true, expect, done_when: <Accept>}
task.update {id: <the task it returns>, budget_minutes: 30}
```

Spawn first and then set the budget. `task.create` carries the budget, but the scheduler takes a ready task at once, and its worker gets no `explicit_done`.

Leave `kind` unset unless it matters, so Deck routes by plan headroom.

## Crew lead

Row for the table At each level in the skill `crew-lead`:

| Board | Start a card | Check | Land |
|---|---|---|---|
| Deck tasks, current wave only | Dispatch as above. The worker's report and capsule return through `task.done` | Deck reviewer of another kind. The packet's `Use` reaches it through the brief | Verify and apply the capsule, or preview and resolve a merge, then commit |

Spawn accounting: at the start, say the spawn sum, such as 8 cards need 16 units, plus 4 for the close, of 24. Each worker and each reviewer costs one spawn unit against `max_work`, so a reviewed slice costs two, and each round of changes adds one for its new reviewer. Keep four units for the close. Before a wave that won't fit, tell the user what has landed and what remains. Their next message or Continue resets the count. Work through tasks rather than messages, because task results aren't hops.

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
| Orchestration is off | Say once that `o` in the Tasks pane turns it on, and spawn through hub, host or herdr. The switch is the user's |

Landing follows the session's mode: ask mode puts each apply to the user, and plan mode refuses it.

The closing report also gives the units spent.

## Capsules

A capsule is how code travels inside Deck.

- Ref form: `capsule:<id>`. A packet's `base` may be `capsule:<id>`, and a report's `Changed` may list one.
- An existing member gets a capsule with the message, and it's applied in its worktree.
- A new isolated worker on a task holding the capsule gets it before starting.
- A receiver checks `base` against the capsule. If the capsule is missing, report `blocked`.

Row for the table in the skill `baton-pass`:

| Code travels as | The next agent starts by | It returns through |
|---|---|---|
| A capsule, as above | Dispatch to an existing member, or spawn one | `task.done`, with its report |

Hand over code first, then finish explicitly with the report as the result, under 3,500 characters.

A packet's `return` is `task.done`. Outside Deck, a worker uses `final message`, or `file:` inside its own worktree.

## Reviewers

The checker in the skill `finish-line` ends with an op, since a reply alone doesn't answer.

- `review.approve {id, note}` when there is no breach, nothing missing, and every key check was re-run.
- Otherwise `review.changes {id, notes}`, with exactly what must change.

Judgement calls go in the note and don't hold back an approval. Checker mode is done only when the review op was called.

## Other machines

Contracts and published capsules reach other machines, and only Deck can do this.

- `task.contract`, `sub.capsule.publish` and `team.post` are G1. Each needs its OK. So does any work contracted to a teammate's Deck.
- For a teammate's Deck, use only portable refs: inline anything that sits in the bench or a worktree path.
- A teammate's Deck can't grant an OK.

## Elsewhere in the stack

- Gates: Deck yolo mode approves tools, not gates. Gates still apply.
- Board: Deck tasks are the thread's working state, and they take the place of the board in the file `artifacts.md` in the skill `house-rules`.
- `merge-case`: you may also push and open through Deck's git panel. Always name the checker and its `independent` value.
- `after-action`: also read skill use, thread history, overlap notices, review bounces, budget blocks and limit pauses.
