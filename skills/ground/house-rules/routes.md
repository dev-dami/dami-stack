# Routes

A route is a named path over blocks. These names are the same everywhere.

Syntax: `a > b` output feeds the next, `[x]` only if needed, `{a, b}` in parallel.

| Route | Composition | Use when |
|---|---|---|
| `one-card` | `failing-test-first` > `finish-line` > commit | One piece of agreed work |
| `idea-to-merge` | `question-tree` + `shared-words` > [`source-trail`, `throwaway-spike`] > `work-chart` > `crew-lead` > `merge-case` > `after-action` | Normal path for anything bigger than a card. Keep interview and chart in one unbroken session; if room runs out, compress at the nearest break |
| `fog` | `work-chart` (hub) > one card per session: decide = `question-tree` + `shared-words`, probe = `source-trail`, try = `throwaway-spike`, chore = do it or `walk-me-through` > `work-chart` (plan) > `idea-to-merge` from the crew stage | Huge effort, key decisions open. Skipping the final chart throws away the linked detail |
| `bug` | `root-cause-hunt` > `finish-line` > [`after-action`] > [`module-depth` if a seam is missing] | Hard failures |
| `inbox` | `intake-desk` > `one-card` per work order | Inbound items |
| `reshape` | `module-depth` (survey) > `question-tree` > `work-chart` | Code keeps resisting change |
| `cross-check` | worker report > check ladder > `finish-line` (checker mode) > verdict | Any dispatched work; built into `crew-lead` |
| `race` | brief with signal > race > [judge] > user keeps one > `finish-line` | Several plausible approaches, cheap to compare |
| `carry` | `baton-pass` send > receiver `baton-pass` > work > report | Work moves |
| `spike-elsewhere` | `baton-pass` to a side session > `throwaway-spike` > verdict returns as a note | The experiment doesn't belong in this session |
| `tighten` | `after-action` > mechanical: `repo-fitting`; judgement: `agent-prose` or standards | Same mistake twice |
| `article` | `article-workshop`: gather > assemble | Writing |

The reference layers `shared-words`, `module-depth` and `agent-prose` sit beneath every route and are read rather than run.

## Navigator

1. Name the state of the work in one line: what exists, what is settled, what is wanted.
2. Pick the first route whose "Use when" fits. A plain question or a one-step edit needs no route: answer it or do it. If one block fits and no route does, name that block.
3. Open every block you are about to name. Check that its trigger fits and that your advice matches its text. Advise skipping a step only after reading what that step does.
4. Give the route, why it fits, and its first block. If the user asked what to do next, start that block unless it needs a decision from them.

When the user asks what exists, give the sets below and the routes that fit their work. Skip the full listing.

## Blocks

| Set | Block | Job |
|---|---|---|
| ground | `house-rules` | Hold the shared rules and find the right route |
| ground | `shared-words` | Keep one vocabulary and record why costly choices were made |
| ground | `module-depth` | Give code a shape where callers learn little and changes land in one place |
| ground | `agent-prose` | Make any document an agent reads smaller and more reliable |
| settle | `question-tree` | Get decisions out of the head of whoever holds them |
| settle | `source-trail` | Establish a fact from whoever owns it, with every claim traced home |
| settle | `throwaway-spike` | Answer one design question with cheap running code |
| settle | `work-chart` | Turn agreement or open fog into one durable graph of cards |
| settle | `intake-desk` | Move inbound reports and requests to one clear outcome each |
| make | `failing-test-first` | Change behaviour through thin red-green steps at public seams |
| make | `root-cause-hunt` | Replace guesses with evidence until the confirmed cause is fixed |
| crew | `crew-lead` | Own a graph or goal and get it finished by a team |
| crew | `baton-pass` | Move work to the next session, agent, tool or person with the least loss, and pick it up at the other end |
| prove | `finish-line` | Decide whether work is really done |
| prove | `merge-case` | Let a reviewer grasp a change and judge merge risk in seconds |
| tend | `repo-fitting` | Fit a repo with one thing it needs, and prove it works |
| tend | `after-action` | Turn session failures into lasting changes to the agent's surroundings |
| tend | `walk-me-through` | Script the steps only a person can do |
| tend | `automation-blueprint` | Specify repeated work well enough to delegate |
| craft | `article-workshop` | Turn raw thought into a finished article |
| craft | `purposeful-tutor` | Teach a topic durably, with the working folder as memory |

`automation-blueprint` and `purposeful-tutor` stand alone, outside every route.

## Commands

Claude Code users can also type a one-word command under the plugin's prefix. Each is a shortcut to the block or route shown. Other hosts reach the same blocks by their descriptions.

| Command | Goes to | For |
|---|---|---|
| `help` | `house-rules` (this file) | What exists, and what fits now |
| `settle` | `question-tree` | Interview on a plan |
| `dig` | `source-trail` | Cited investigation |
| `spike` | `throwaway-spike` | Throwaway experiment |
| `chart` | `work-chart` | Chart and slice |
| `build` | route `one-card` | Build one card |
| `crew` | `crew-lead` | Run a chart with a team |
| `goal` | `crew-lead` (`standing-goal.md`) | Agree and pursue a long goal |
| `fix` | `root-cause-hunt` | Hard bug |
| `check` | `finish-line` | Verify the current work |
| `ship` | `finish-line` > `merge-case` | Check, then draft the PR |
| `pass` | `baton-pass` | Hand work on |
| `debrief` | `after-action` | Session review |
| `learn` | `purposeful-tutor` | Tutoring |
