---
description: Try to break the current change, keeping only findings proven by a run
argument-hint: [target]
disable-model-invocation: true
---
Use the skill `finish-line` and follow its file `break-lens.md` on: $ARGUMENTS

With no target, take the current branch's diff from its merge-base through the working tree. This is a review the user asked for: stop at the report, unless the request also asks for fixes.
