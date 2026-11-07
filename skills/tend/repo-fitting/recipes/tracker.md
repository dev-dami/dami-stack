# Tracker

Records once how this repo tracks work, names its states and lays out its domain docs, so no block has to guess. Runs when a block finds this missing. Run it again only when the tracker changes or the user wants a fresh start.

This is a guided conversation, not a form. Few questions, each led by a recommendation that one word can accept. Skip anything inspection already settled.

## Inspect

- Remotes, and whether this clone is a fork.
- Instruction files.
- The glossary, under any older file name too. Offer a rename if you find one.
- Decision records, and output from earlier runs.
- Signs of a local tracker: numbered files, a status folder.
- Whether the skill `intake-desk` is in use here.
- Monorepo signs: workspace config, several package roots.

## Settle, one topic at a time

**Tracker.** Recommend the remote's host. With no remote, recommend local Markdown files. "Other" is fine: record it as prose. A hosted choice needs a reachable repo, so wire one up if needed and confirm the CLI can see it. A local tracker keeps its files in the bench or the repo, whichever the user prefers.

**Labels.** Only when `intake-desk` is in use. One question: keep the default names? Collect overrides only on a no, and reuse labels that already exist.

Defaults: `defect`, `improvement`, `needs-evaluation`, `needs-reporter`, `ready-to-build`, `needs-human`, `declined`. Hub cards use their type as the only label: `decide`, `probe`, `try`, `chore`. State labels don't apply to them.

**Docs.** Assume one context and say nothing. Offer several contexts only on monorepo signs.

## Write

1. Show every draft for editing and get the OK.
2. Edit whichever instruction file exists, and never create a second. If there is none, ask which to create. If the section is already there, edit it where it stands and leave the rest of the file untouched.
3. Add a short pointer section to the instruction file, and put the tracker document beside the agent docs, or wherever the repo keeps such files.
4. Create any missing labels on a hosted tracker.

## The tracker document

Map each operation to an exact command or file edit, and give a fallback where the first choice can fail.

| Operation | Records |
|---|---|
| publish | Create an item from an artifact |
| fetch | Read one item with its comments |
| comment | Add a note to an item |
| label | Add or swap a type or state |
| block | Link a blocker, with a fallback when native links are missing: a `Blocked by` line in the body |
| count blockers | How many open blockers an item has |
| close | Close an item, comment first |
| claim | Assign before work, so a parallel session skips it |
| resolve | Post the answer, close, update the hub |
| ready query | Open, unblocked and unassigned items |

Include a switch that makes external pull requests count as inbound requests. It stays off, and nobody raises it unless the maintainer does.

For a hosted tracker, also state how to show a person an item: title with a link, never a bare number.

## Local tracker shape

```
<tracker root>/
  <feature>/
    spec.md
    01-<slug>.md      first line: Status: open | claimed | done | dropped
    02-<slug>.md
```

## Hazards to write into the document

- Only open issues in repos the user owns. On a fork, check the target, because tooling can default to upstream.
- Comment first, then close. A comment sent along with a close can vanish if the item was already closed.
- REST blocking links want the numeric database id, not the item number.
- Issues and pull requests share one number space, so a bare number could be either.

## Finished when

A real `fetch` and `ready query` work through the mapping, every operation above has an entry, the questions asked were the fewest that could settle it, and the surrounding sections of the instruction file are intact.
