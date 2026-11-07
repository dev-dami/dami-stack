---
name: merge-case
description: "Use when writing or updating a pull request body, once the work has passed finish-line. Publishing it needs OK."
user-invocable: false
---
# Merge case
Gate: get the user's OK before pushing, or opening or updating a PR (G1). See gates.md in the skill house-rules.
Job: Let a reviewer grasp a change, trust it and judge merge risk in seconds.
Takes: a diff and a report.   Gives: a PR body.

## Steps

1. **Get the report.** If the work has no report yet, use the skill `finish-line` first. When updating, read the current body and keep what people added to it.
2. **Open plainly.** No preamble. Say what changed in brief prose, in the project's words.
3. **Show the change** in the smallest view that fits: pseudocode, a call tree, a UI tree, a file tree, a sequence diagram, a diff of any of those, or a full block when the code is mostly new. Keep only the elements that matter. Put each visual beside its text. Add a second view only if the first can't carry the point.
4. **Prove it with before and after.** Use a screenshot when the change is visual and that's practical. Otherwise use execution output showing the exact test that flipped. Take evidence from the report and keep its labels: a `[reported]` line stays `[reported]`.
5. **Judge the danger.** Say whether it's cheaply reversible, and destructive or hard to undo means no. Add a one-word blast radius, with optional detail, thinking about consumers, layout and mobile.
6. **Say what checked it.** On deck, name the checker and its `independent` value. Carry over anything under the report's `Left`.
7. **Publish.** Show the body. An explicit request such as "open the PR" is already the OK for that push and PR, so go ahead. Otherwise ask first. Push and open through the host's own `gh`, passing the body from a file, or through Deck's git panel.

## Shape

```markdown
Login now rejects a sixth attempt per IP per minute.

request > rateLimit(ip) > login
              \-- 429 + Retry-After

Before: the sixth attempt returned 200.
After: `sixth attempt returns 429` went from failing to passing. [observed]

Reversible: yes, config flag. Blast radius: auth.
Checked by: codex, independent: other-kind.
Left: per-account limit, card c9.
```

Every line earns its place. Drop any section the change doesn't need, and nothing goes in for decoration.

## Done when

- The body opens with the change, in project words, and has no preamble.
- It holds one fitting view, a before-and-after proof, and a danger line with reversibility and a one-word blast radius.
- Every evidence claim comes from the report with its label intact, and the report's `Left` items appear.
- On deck, the checker and its `independent` value are named.
- The body was shown, and the push and PR ran only under an OK. Without one, the body is handed over unpublished.
