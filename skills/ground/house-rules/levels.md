# Levels

A level says how much team tooling is here. Blocks name team moves; this file alone maps moves to tools.

## Detect the level

Pick the first that holds. Say which, once, when a block first uses a team move: `Level: hub, kinds claude, codex.`

| Level | Test |
|---|---|
| hub | You can call the dami hub's `team_ask` tool. Hosts may prefix the name, for example `mcp__dami__team_ask` or `mcp__plugin_dami_dami__team_ask` |
| host | You have a subagent tool of your own. Check your tool list, don't assume |
| herdr | `HERDR_ENV=1`, or `herdr agent list` succeeds |
| solo | None of the above |

If you are inside a Deck thread (MCP server `deck`, `execute {op:"thread.roster"}` answers), read the file `deck-adapter.md` in the skill `house-rules`. It overrides the move table there.

The level `hub` means the dami hub, not the hub shape of a chart.

## Degrading

Levels degrade per move, not as a whole.

- **Hub not registered.** Hub MCP tools are visible only if the client registered the server. If your tool list lacks them, you aren't at hub, whatever another agent on this machine can do.
- **Other kinds.** At hub, `team_roster` lists the CLIs that can start. Elsewhere, check PATH for `claude`, `codex`, `opencode`.

## Team moves

| Move | hub | host | herdr | solo |
|---|---|---|---|---|
| see team | `team_roster` | own tools, PATH | `herdr agent list` | self |
| board | `board` | bench `board.md` | bench `board.md` | bench `board.md` |
| dispatch | `team_ask {to, message: <packet>, mode, isolate}`, then `team_run`; or `team_send` to an agent already running | host subagent tool, packet as prompt | new workspace and agent (see Herdr dispatch) | do it next, in order |
| isolate | `isolate: true` on `team_ask`, which returns a branch | `git worktree add`, or the host's worktree option | `git worktree add`, workspace `--cwd` there | one branch at a time |
| claim files | `lease` | lead assigns files in `board.md` | same | not needed |
| hand over code | branch name in the report | branch name in the report | branch name in the report | commit |
| land | merge the branch | merge the branch | merge the branch | already there |
| race | several isolated `team_ask` runs on one brief, compare branches, the user keeps one | N workers, isolated, compare diffs | N workspaces | one attempt, and say no race ran |
| check | `team_ask` to another kind, read mode | fresh subagent, or an other-kind workspace if Herdr is up | other-kind workspace | clean second pass, labelled `self` |
| steer | `team_send` to a running agent. A headless run doesn't read its inbox, so stop it and re-ask with a better packet | subagent message, if supported | none | none |
| remember | `note` | bench `notes/` | bench `notes/` | bench `notes/` |
| budget | `timeout_minutes` on `team_ask` | stop condition in the brief, unenforced | same | same |
| look back | session logs | session logs | session logs | session logs |
| other machine | not available (a packet the user carries) | not available | not available | not available |

## Hub

Plan around these.

| Limit | Value | Consequence |
|---|---|---|
| Active runs | 3 | Caps a wave or race at 3 at once. A refusal means wait with `team_run`, not fail |
| Runs started | 24 per 10 minutes | A loop brake. When hit, stop and tell the user. Never route around it through another level |
| Run reply | Clipped to the last 20,000 characters | End the final message with the report. Long output goes in a file in the worktree |
| Inbox copy of a reply | First 3,500 characters | A report under 3,500 arrives whole. Read anything longer with `team_run` |
| Run timeout | 15 minutes default, 60 max | Set `timeout_minutes` from the card's budget. Split a card that needs more |
| Lease | 15 minutes default, 120 max | Renew on long work |
| Note | 2 KB | Short traps, not docs |

How runs behave:

- Headless agents can't ask the user anything. The packet must hold all they need. A question or a gate comes back in the reply, under `Open` or `Needs OK`.
- `team_ask` with write mode and no isolate edits the shared tree, so claim files with `lease` first.
- A run may not have the hub's tools, because each client registers the server itself. The lead holds a worker's leases and updates `board` for it.
- An isolated worktree starts from the last commit of your tree. Uncommitted work isn't in it, and neither is a branch that hasn't landed. See The wave rule in the skill `crew-lead`. Isolation needs a git repo with a commit.
- A read run starts in your tree, not in a worker's worktree. A checker's packet names the branch, and the folder `team_run` reported.
- A headless worker may leave edits uncommitted `[assumed]`. Its packet says to commit on the branch. Before landing, confirm the branch holds the work, and look in the run's folder if it doesn't.
- `team_run {id, stop: true}` stops a run.
- Any MCP client can read the skills through the `skills` tool, even one with no copy of them.

## Check ladder

Use the first rung available, and record it in the report's `independent` field:

Other-kind `team_ask` → other-kind Herdr workspace → same-kind fresh subagent → solo second pass.

| Rung | `independent` |
|---|---|
| Other-kind `team_ask`, other-kind Herdr workspace | `other-kind` |
| Same-kind fresh subagent, or a same-kind `team_ask` | `same-kind-fresh` |
| Solo second pass | `self` |

Headless forms: `claude -p` and `codex exec` are `[observed]` working through the hub. OpenCode is `[untested]`. If a kind fails, drop to the next rung. Outside the hub, check `--help` at use, and pass a short prompt holding only the packet path, so no shell interprets packet text.

## Herdr dispatch

These are the only commands the launcher has proven:

```
git worktree add <path> -b <branch>
herdr workspace create --cwd <path> --label <name>     → result.root_pane.pane_id
herdr agent start <name> --kind <kind> --pane <pane> --timeout 60000 -- <cli args>
herdr agent list                                       → agents[].agent_status, cwd
```

Retry on `agent_pane_busy`. `--kind claude` is observed; other kinds are `[untested]`, so check `herdr agent start --help`. On any Windows `.cmd` shim, go through Node with quoted args, as `damistack.js` does.
