---
description: Check, open the PR, and drive it to merge-ready
argument-hint: [what to land] [merge]
disable-model-invocation: true
---
Land: $ARGUMENTS

This request is the user's G1 OK, for this one PR, to push its branch, open the PR ready for review, push fixes to it, and reply to and resolve its review threads. It is also the OK to prove the work by running the app and taking screenshots. It grants nothing else.

1. Use the skill `finish-line` on the work, and fix what it finds in scope.
2. Use the skill `merge-case` to write the body, then publish it: push, and open the PR.
3. Follow the file `follow-through.md` in the skill `merge-case` in `drive` mode until its merge gate passes.
4. Stop with `ready` and the raw PR URL alone on a line. Merge only if the last word of the request after "Land:" is exactly `merge`. The word anywhere else is part of the task, as in `fix the merge queue retry`.

When a question needs the user and nobody answers, leave the PR open and lead the final message with the question.
