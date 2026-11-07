# Levels

A level says how much team tooling is here. Blocks name team moves; this file alone maps moves to tools.

## Detect the level

Pick the first that holds. Say which, once, when a block first uses a team move: `Level: deck, spawn on, kinds claude, codex.`

| Level | Test |
|---|---|
| deck | You have `search` and `execute` tools from an MCP server named `deck`, and `execute {op:"thread.roster"}` answers |
| host | You have a subagent tool of your own. Check your tool list, don't assume |
| herdr | `HERDR_ENV=1`, or `herdr agent list` succeeds |
| solo | None of the above |

## Degrading

Levels degrade per move, not as a whole.

- **Deck with orchestration off.** The board, leases, memory, capsules and `thread.send` to existing members all work. `agent.spawn` and `task.race` are refused with "orchestration is off". Say once that `o` in the Tasks pane turns it on, then use host or herdr for spawning only. The user controls this switch, so never try to work around it.
- **Other kinds.** On deck, use `thread.roster` and `review: other`. Elsewhere, check PATH for `claude`, `codex`, `opencode`.

## Team moves

Deck calls go through `execute {op, args}`. `search {query}` finds ops and skills.

| Move | deck | host | herdr | solo |
|---|---|---|---|---|
| see team | `thread.roster`, `peers.list` | own tools, PATH | `herdr agent list` | self |
| board | `task.create`, `task.list`, `task.update` | bench `board.md` | bench `board.md` | bench `board.md` |
| dispatch | `agent.spawn {brief, title, kind, model, effort, task, isolate, expect, done_when, explicit_done, review}`, or `thread.send {to, message, new_task, task, expect, done_when, explicit_done, capsule}` for an existing member | host subagent tool, packet as prompt | new workspace and agent (see Herdr dispatch) | do it next, in order |
| isolate | `isolate: true` | `git worktree add`, or the host's worktree option | `git worktree add`, workspace `--cwd` there | one branch at a time |
| claim files | `lease.acquire {paths, exclusive, minutes, reason}`, `lease.release`, `lease.list` | lead assigns files in `board.md` | same | not needed |
| hand over code | `sub.patch.capture {task}`, then `task.done {id, result, capsule}` or `thread.send {capsule}` | branch name in the report | branch name in the report | commit |
| land | `sub.patch.verify`, `sub.patch.apply`, or `sub.merge.preview` then `sub.merge.resolve {strategy}`; then commit | merge the branch | merge the branch | already there |
| race | `task.race {brief, agents, judge, review}` | N workers, isolated, compare diffs | N workspaces | one attempt, and say no race ran |
| check | `review: "other"` on task, spawn or race; reviewer answers `review.approve {id, note}` or `review.changes {id, notes}` | other-kind CLI headless, else a fresh subagent | other-kind workspace | clean second pass, labelled `self` |
| steer | `task.steer {id, message}` | subagent message, if supported | none | none |
| remember | `memory.add {text, paths, lines}`, `memory.read`, `memory.drop` | bench `notes/` | bench `notes/` | bench `notes/` |
| budget | `budget_tokens`, `budget_usd`, `budget_minutes` on `task.create` or `task.update`; `agent.spawn` takes none, so spawn and then `task.update` the task it returns; `kind` left empty routes by plan headroom | stop condition in the brief, unenforced | same | same |
| look back | `history.threads`, `history.search`, `history.read`, `skills.used` | session logs | session logs | session logs |
| other machine | `task.contract {peer, brief, title}`, `sub.capsule.publish`, `sub.capsule.fetch`, `team.read`, `peers.status` | not available | not available | not available |

## Check ladder

Use the first rung available, and record it in the report's `independent` field:

Deck `review: "other"` → other-kind CLI headless → other-kind Herdr workspace → same-kind fresh subagent → solo second pass.

| Rung | `independent` |
|---|---|
| Deck `review: "other"`, other-kind CLI, other-kind workspace | `other-kind` |
| Same-kind fresh subagent | `same-kind-fresh` |
| Solo second pass | `self` |

Headless forms: `claude -p` is confirmed by the Deck docs. The Codex and OpenCode forms are `[assumed]`, so check `--help` at use. If a form is absent, drop to the next rung. Pass a short prompt holding only the packet path, so no shell interprets packet text.

## Herdr dispatch

These are the only commands the launcher has proven:

```
git worktree add <path> -b <branch>
herdr workspace create --cwd <path> --label <name>     → result.root_pane.pane_id
herdr agent start <name> --kind <kind> --pane <pane> --timeout 60000 -- <cli args>
herdr agent list                                       → agents[].agent_status, cwd
```

Retry on `agent_pane_busy`. `--kind claude` is observed; other kinds are `[untested]`, so check `herdr agent start --help`. On any Windows `.cmd` shim, go through Node with quoted args, as `damistack.js` does.

## Deck limits

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
| Worktree | Starts from the repo's last commit | See the waves in `crew-lead` |
| Pinned note | 2 KB, 500 per repo | Short traps, not docs |
