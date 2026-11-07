# Structure survey

Find where structure causes friction and propose consolidations that make the code easier to test and navigate. Run it when code keeps resisting change or tests, when the user asks about structure, or in a quiet moment. Feature work doesn't need it. Nothing enters the repo until the user picks a candidate.

## Steps

1. **Scope.** Take any direction the user named. Otherwise read a good stretch of commit history and weight the areas that change most, because consolidation pays back through future edits. If changes are scattered, widen the scope. Read the glossary and decision records.

2. **Explore.** Read the file `levels.md` in the skill `house-rules`, then dispatch a fresh scout to walk the scoped code without a fixed route, noting:
   - concepts scattered across many small modules
   - interfaces as complex as what they hide
   - logic pulled out only for tests, while bugs live in the code that calls it
   - coupling that leaks across seams
   - areas that are hard to test

   At solo, do this walk yourself and say so.

3. **Filter.** Apply the removal test from this skill to each finding. Give each survivor its dependency category.

4. **Report.** Run `node <house-rules>/scripts/bench.js`, using the folder of the skill `house-rules`, and write one self-contained, timestamped HTML page to the bench's `reports/` folder. Open it for the user and give its path.

   Each candidate shows:
   - the files involved, the problem and the change
   - the benefits, in this skill's words
   - a before-and-after diagram
   - a strength rating
   - its dependency category

   One top pick closes the page. Let diagrams carry the weight and vary their form by the point being made. Keep prose short and free of vague praise. If a diagram needs a paragraph to explain it, redraw it. Bring up a conflicting decision record only where the friction is bad enough to reopen it.

5. **Ask which to pursue.** Propose no interfaces yet.

6. **On a pick,** use the skill `question-tree` with the skill `shared-words`, working through constraints, dependencies, shape and which tests survive. On request, follow `design-it-twice.md` for that candidate.

7. **On a rejection,** ask why. If the reason will last, offer a decision record through the skill `shared-words`, so later surveys stop suggesting it. Skip passing reasons.

## Done when

- The scope and how it was chosen are stated.
- Every candidate traces to real change patterns or a named direction, and passed the removal test.
- Every candidate has all five parts above, and the page ends with one top pick.
- The page sits in the bench, was opened for the user, and its path was given.
- No interface was proposed before a pick, and nothing entered the repo.
- A lasting rejection was offered a record.
