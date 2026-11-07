# Code smells

A baseline for the rules lens, from Martin Fowler's published catalogue in *Refactoring*. It applies even in a repo with no convention docs.

Smells are tentative. A documented project rule overrides any of them, and anything tooling already enforces is skipped. Report a smell as a judgement call unless a project rule makes it a breach.

| Smell | Look for in the diff | Usual move |
|---|---|---|
| Mysterious name | You have to read the body to learn what a function, variable or type is for | Rename it after what it means to a caller |
| Duplicated code | The same logic appears twice, or a near copy with small edits | Pull it into one place |
| Feature envy | A function works mostly on another object's data | Move the behaviour to where the data lives |
| Data clumps | The same few fields or parameters always travel together | Give the group a type of its own |
| Primitive obsession | A string or number stands in for a concept such as money, a status or an id | Introduce a small domain type |
| Repeated switches | The same branch on a type or kind shows up in several places | One dispatch, or polymorphism |
| Shotgun surgery | One logical change touched many files by small amounts | Gather what changes together |
| Divergent change | One file changes for unrelated reasons | Split it along those reasons |
| Speculative generality | Hooks, parameters or abstractions serve no present need | Remove them until something needs them |
| Message chains | A caller walks a long path of objects to reach what it wants | Hide the path behind one call |
| Middle man | A class mostly forwards to another | Call the real one directly |
| Refused bequest | A subclass inherits code it ignores or overrides away | Use composition, or reshape the hierarchy |

Each finding names the smell, quotes the code, and says why it hurts here. A smell in code the diff didn't touch is out of scope unless the change made it worse.
