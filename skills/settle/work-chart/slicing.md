# Slicing

Turn a plan into cards a fresh session can finish, with order made explicit so work can run in parallel.

## Steps

1. **Read the source in full,** including any comments. Explore the code. If prefactoring would make the slices simpler, schedule it first as its own cards.

2. **Cut tracer bullets.** Each `slice` card is a thin path through every layer it touches, showable working on its own and finishable in one fresh session. "User can reset a password by email" is a slice. "Add the tokens table" is a layer.

3. **Record true blockers only.** A card belongs in `needs` only if it can't start or be proven without the other card. Fewer links mean more parallel work.

4. **Handle sweeping mechanical changes with expand-and-contract.** A wide rename or API replacement can't land as a slice, so:
   - add the replacement next to the existing form
   - move callers across in groups scoped by impact, one card per group
   - delete the old form at the end

   If a group would break the build by itself, put the groups on one shared branch, closed by a single card that verifies the whole.

5. **Write each card** in the card shape, stating user-visible behaviour and independently testable acceptance criteria. Carry the agreed test seam in `Accept`. Name no layers, file paths or code, because published cards must survive code change.

6. **Present the set:** title, blockers and delivered behaviour for each card. Iterate on granularity and blockers until the user approves.

7. **Publish in order,** starting with blockers, so every reference points at something that exists. Prefer the tracker's own dependency links, and fall back to plain text. If that order isn't possible, create everything, then wire the links afterwards using the real ids, because a placeholder number can link to the wrong item. With a local tracker, write one numbered file per card. Nest cards under any source item and leave that item untouched.

## Done when

- Any card whose blockers are finished can start at once.
- Each card can be shown working alone and fits one fresh session.
- Each `needs` entry is a true blocker.
- Mechanical sweeps follow expand-and-contract, with the old form's removal as the last card.
- No published card has paths, line numbers or layer lists.
- The user approved the set before anything was published.
- Every published blocker link points at a real id, and the source item is unchanged.
