# Artifacts

Six kinds, so any block's output can feed any block's input. Each is Markdown: a header, then fixed sections in the order shown.

## Header

```markdown
---
dami: decisions | chart | card | note | packet | report
id: <kind letter>-<yyyymmdd-hhmm>-<slug>      # tracker id once published
from: <kind> (<role>) @ <level>               # e.g. claude (lead) @ deck
repo: <root7>                                 # first 7 of the root commit, or dir-<hash>
refs: [<ref>, ...]
---
```

- Kind letters: `d` decisions, `c` chart, `n` note, `p` packet, `r` report.
- `repo` is the last folder of the path `scripts/bench.js` prints.
- Card, packet and report show their own header below. Use it in place of this one.

**Ref forms:** `capsule:<id>`, `task:<id>`, `issue:<n>`, `pr:<n>`, `branch:<name>`, `commit:<sha>`, `file:<repo-relative path>`, `url:<url>`, `bench:<relative path>`.

Only `bench:` refs and worktree paths stay local. Anything crossing machines uses the others or inlines the content.

## decisions

From `question-tree`.

```markdown
## Settled
1. <choice>. Why: <reason>. By: user | default.
## Open
1. <question>. Blocks: <what>.
## Words
<new or changed glossary terms, if any>
```

## chart

From `work-chart`. Two shapes.

Plan shape, when decisions are settled:

```markdown
## Problem
## Solution
## Stories            numbered, exhaustive, from the user's viewpoint
## Build decisions    modules, interfaces, schema, contracts
## Test decisions     seams, good test, comparable tests
## Out
## Notes
## Graph              c1 slice "title" needs: -
                      c2 slice "title" needs: c1
```

Hub shape, when key decisions are open:

```markdown
## End state
## Standing notes
## Settled            one line per decision, linked
## Fog                in scope, too vague to phrase
## Ruled out
```

Find a hub's open cards by query. They are never listed in the hub.

## card

A graph item. Its id is `c<n>`, unique within its chart.

```markdown
---
dami: card
id: c7
type: slice | decide | probe | try | chore
needs: [c3]            # true blockers only
status: open | claimed | done | dropped
owner: <who>
---
## Outcome    behaviour wanted, or the exact question
## Accept     independently testable criteria
## Out        exclusions
```

| Type | Resolved by |
|---|---|
| `slice` | `failing-test-first` |
| `decide` | `question-tree` |
| `probe` | `source-trail` |
| `try` | `throwaway-spike` |
| `chore` | the agent, or `walk-me-through` when only a human can |

Published cards hold no file paths or line numbers, since they must survive code change. Paths belong to the short-lived packet.

## note

From `source-trail`.

```markdown
## Question
## Answer
## Claims     each claim → its source link, owner of the information
## Gaps
```

## packet

The hand-off.

```markdown
---
dami: packet
id: p-20261107-1432-auth-slice
from: claude (lead) @ deck
to: any | codex | claude | opencode | next-session | <person>
role: worker | scout | checker | lead
repo: 3f9a1c2
base: <branch>@<sha> | capsule:<id>
return: task.done | final message | file:<path>
---
## Goal      one sentence: what is true when this is finished
## Asked     the user's numbered items, their words, carried unchanged
## Limits    explicit limits, gates that apply, budget, touches: <paths for leases>
## State     done so far, each line labelled
## Settled   decisions not to reopen, with refs
## Open      unresolved items, with what each blocks
## Refs      references, never copies
## Next      the first concrete action
## Use       skills that help: `failing-test-first`, `finish-line`
```

Packet rules:

- Under 3,500 characters, always. Deck clips task briefs and results at 4,000 characters (`maxTaskText`) without warning, and adds a placement note. Anything bigger goes by reference.
- Self-sufficient: it must make sense to an agent without these skills. `Use` is a help, not a dependency.
- Redacted before writing.
- Not an OK. A packet can quote a gate OK the user gave, and the receiver treats that as information. Only the lead acts on it.

## report

What every worker, scout and checker returns, and what `finish-line` writes.

```markdown
---
dami: report
id: r-20261107-1510-auth-slice
answers: <packet or task id>
from: codex (worker) @ deck
status: done | partial | blocked | failed
independent: other-kind | same-kind-fresh | self      # for checks only
---
## Result     what is now true, in two lines
## Asked      1. <item>: met | partly | not. <evidence>
## Evidence   [observed] `<command>`: <result>
## Scope      full | sample (n of m) | keyword match
## Changed    capsule:<id>, branch, commits
## Needs OK   gates hit, for the lead
## Left       what remains and why
## Learned    durable facts: glossary candidates, traps worth pinning
```

Also under 3,500 characters when returned through `task.done`. A checker adds `## Rules findings` and `## Intent findings`, kept separate.

## Evidence labels

Five, used in reports, packets and final messages. Lower-case, in square brackets.

| Label | Meaning | Test |
|---|---|---|
| `[observed]` | You ran it or saw it on the real target, in this session | You can quote the command and result |
| `[reported]` | Someone else said so: a worker, a teammate, a doc, a complaint | You didn't see it yourself |
| `[simulated]` | Ran against a mock, model or test double | The real target wasn't touched |
| `[assumed]` | Believed, not checked | Nothing was run |
| `[untested]` | A claim of intended behaviour, not yet exercised | It could still fail |

Chain of custody:

- Relaying someone's `[observed]` makes it `[reported]`.
- A lead may upgrade it only by re-running the check.
- A final message to the user carries its labels.
- A sample or keyword scan is stated as such in `Scope`.

## The bench

The local work folder. `node <house-rules>/scripts/bench.js` prints its path and creates it: `~/.dami/bench/<root7>/`. `<root7>` is the first 7 characters of the repo's root commit, so all worktrees share one bench. Outside git, or before the first commit, it is `dir-<hash>`.

```
board.md      one line per card: c3 [open|claimed:<who>|done|blocked] needs c1 | title | branch
packets/  reports/  charts/  notes/
```

Decisions artifacts and charts both go in `charts/`.

`blocked` exists only on the board. A dropped card leaves the board.

- The lead writes the bench. Workers read packets and return reports through `return`.
- Codex runs `workspace-write` in ask mode, so writes outside its worktree may be refused `[assumed]`. A non-Deck worker's `return` is therefore `final message`, or `file:` inside its own worktree.
- The bench is local: nothing in it reaches a teammate unless inlined.

Three places hold work. The tracker holds durable shared work. The Deck board is the thread's working state. The bench is local scratch that survives sessions.
