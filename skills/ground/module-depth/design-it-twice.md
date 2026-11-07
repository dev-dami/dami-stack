# Design it twice

Ousterhout's practice: the first shape you think of is rarely the deepest, so produce several and compare. Read the file `levels.md` in the skill `house-rules` before dispatching.

## Steps

1. **Tell the user the setup.** Post the constraints, the dependencies and a rough sketch. Carry on without waiting for a reply.

2. **Dispatch three or more scouts in parallel**, each starting fresh with one stance. Use different agent kinds where the team has them, since kinds disagree usefully.

   | Stance | Pushes toward |
   |---|---|
   | Fewest entry points | The smallest interface that can do the job |
   | Maximum flexibility | Room for uses nobody has asked for yet |
   | Simplest common case | The everyday call being a one-liner |
   | Ports and adapters | Clean seams around outside systems. Use when outside systems are involved |

   Each packet holds the technical brief, the stance, the Words from this skill, and a ref to the project's glossary, so the scout has both vocabularies. Scouts see no one else's design.

3. **Collect the same five things from each:** interface, usage example, what it hides, how it treats dependencies, and trade-offs.

4. **Compare in prose** on depth, how well change concentrates, and where the seams fall. Each scout's design is `[reported]` until you've tried it.

5. **Recommend firmly.** Pick one, or a hybrid if that is genuinely better, and say why. Leave no menu for the user to sort out.

At solo, write each stance in turn, finishing one before starting the next, and say the designs were not independent.

## Done when

- At least three stances returned all five items.
- The user saw the constraints, dependencies and sketch before the comparison.
- The comparison covers depth, change concentration and seam placement for every design.
- One design or hybrid is recommended, with its reasons.
- The level used, and any kinds used, are stated.
