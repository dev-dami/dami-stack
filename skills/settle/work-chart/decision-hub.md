# Decision hub

For new or very large efforts where key decisions are still open. Across many sessions, it works out the route by closing decisions one by one in a record everyone shares. It is slow and demanding, so a well-scoped feature doesn't get one.

The product here is settled choices, not built work, unless the hub's standing notes say otherwise.

## The hub

One tracker item in the chart's hub shape. It only summarises and links:

- a short end state
- standing notes
- one line per settled decision, with the detail kept in its card
- fog: things that belong to the effort but can't yet be put as a question
- ruled-out work

Open cards are found by query and are never listed in the hub.

## Cards

A card asks one question, small enough for one session (roughly 100k tokens), and carries one type.

| Type | Resolved by |
|---|---|
| `decide` (default) | Conversation: the skill `question-tree` with the skill `shared-words` |
| `probe` | Unattended reading: the skill `source-trail` |
| `try` | An experiment with a person in the loop: the skill `throwaway-spike` |
| `chore` | Decides nothing but unblocks a decision. The agent does it, or uses the skill `walk-me-through` when only a human can. The answer records the resulting facts |

Never answer for the human. A chore that signs up to a service needs OK like any other gate. Type markers are the only labels here. The state labels from the skill `intake-desk` don't apply.

Use native tracker links, so readiness shows in the tracker's own view. Create all the cards, then wire the links in a later pass once real ids exist, because a placeholder number can link to the wrong item. A card is ready when it is open, unblocked and unassigned. Claim it by assigning it before you start, so parallel sessions skip it. When you show cards to humans, give each title with its link, so nobody has to decode a number.

**Card or fog?** If you can word the question precisely now, even with no answer in sight, it is a card. Otherwise it stays coarse and unsplit in Fog.

**Ruled out.** The card closes with one explaining line under `Ruled out`. It stays off the decision list and comes back only as a new effort.

## Starting

1. Settle the end state by interview, using the skill `question-tree`.
2. Sweep breadth-first for open decisions. If no unknowns turn up, this effort doesn't need a hub, so stop and ask the user what they want.
3. Show the hub and cards, get OK, then create and wire them. Use the skill `repo-fitting` first if tracker setup is missing.
4. Launch every `probe` in parallel with the dispatch move. Findings go on an unmerged branch, pushed with OK, with no pull request.
5. Stop. Resolve nothing by hand in this session.

## Continuing

Ask once for the session's list: `OK to claim <card>, post its answer and close it on <tracker>? Undo: reopen and unassign.`

1. Load the hub only. Fetch related cards on demand.
2. Take the named card or the first ready one, and claim it.
3. Resolve it by its type marker, whatever its text suggests. Use any skills the standing notes name.
4. Post the answer, close the card, and add its decision line to the hub.
5. Update the rest:
   - add new cards
   - promote fog that can now be phrased, removing it from Fog
   - rule out what lies past the end state
   - update or delete cards the answer invalidated

One card per session, probes excepted.

## Ending

When doing starts to feel like the obvious next move, planning is finished. Make the plan-shape chart from the hub, by the steps in `SKILL.md`. Skip that only if the effort proved small and the user agrees, because going straight to building throws away the linked detail.

## Done when

Starting:

- The end state is settled, and the hub holds only the five parts above.
- Every open decision that can be phrased is a card with one type, and the rest sit in Fog.
- Blocker links use real ids, and probes are running.
- No card was resolved by hand.

Continuing:

- One card was claimed before work and resolved by its type, with probes the only extras.
- Its answer is posted, the card is closed, and the hub has its decision line.
- New cards, promoted fog, ruled-out work and invalidated cards are all reflected.
- Nothing was answered on the human's behalf.
