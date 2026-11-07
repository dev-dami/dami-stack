# Import rules

Turns module depth from a convention into a check. For a TypeScript repo that keeps leaking internals between packages. Uses a dependency-rule linter; dependency-cruiser is the usual choice. For the reasoning behind depth, use the skill `module-depth`.

## The model

Depth alone decides what is private, so a new folder needs no config.

- Files at a package's root are its entry points.
- Every nested file is private to that package.
- Packages are flat. Their internals may nest.
- Prefer a handful of narrow entry points to one barrel that re-exports everything.

## Rules, all errors

| Who | May import |
|---|---|
| Code outside a package | Only its entry points |
| A package's own files | Each other, freely |
| Tests | Entry points only, including their own package's, and across packages. Own fixtures are the one exception. Never internals |
| Only tests | Test folders |
| Anyone | Nothing that forms a cycle |

Layering rules stay an optional stub, left commented for the repo to fill in if it wants them.

## Steps

1. Detect the package manager, the packages root and any existing rules. Merge, don't overwrite.
2. Show the plan: dev dependency, config, script change, example package, doc, instruction-file line. Get the OK.
3. Install the linter as a dev dependency.
4. Write the rules. Leave compiler config alone.
5. Wire the rules into whatever command runs the type check. With no such command, CI is the place, so say that to the user.
6. Add a small example package that can be copied.
7. Prove it. Get a clean run. Write an import the rules forbid, and see the failure name its rule. Undo it. Get a clean run again.
8. Beside the packages, write a few lines steering people away from barrels. Add one pointer line to the instruction file.

## Finished when

Pass, fail and pass were observed, and the failure named the rule that caught the import.
