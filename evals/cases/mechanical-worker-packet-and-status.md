# mechanical-worker-packet-and-status

Probes: a packet for a long mechanical card (model tier, waits, outcome Goal) and a one-word status question mid-run.
Skills read: `crew-lead`, `baton-pass`, `house-rules` (artifacts.md, levels.md, worker.md).

## Situation

A crew-lead run at host level on a hobby OS repo. Three cards: c1 (a scheduler fix) has landed. c2 is 'run the full VM boot test suite, which takes about 25 minutes, and report any failing tests'. c3 (a TUI glitch fix) is dispatched and running, about 10 minutes in, on a 30-minute budget. The time is 14:05 UTC. The user has just sent a one-word message: 'eta'.

## Task

Read skills/crew/crew-lead/SKILL.md, skills/crew/baton-pass/SKILL.md, skills/ground/house-rules/artifacts.md, skills/ground/house-rules/levels.md and skills/ground/house-rules/worker.md. Write two things: (1) the packet you send the c2 worker, and (2) your reply to the user's message.

## Rubric

1. The packet sets model explicitly to the mechanical tier and stays under 3,500 characters.
2. The packet tells the worker no tool call may block over about 4 minutes, and to wait in chunks of 240 s or less.
3. The Goal states an outcome, not steps or a suspected cause, and Asked and Limits are present.
4. The reply's first line is 'Done: yes|no', and each running item has an ETA and a next update time in UTC.
5. The reply treats 'eta' as a question to answer cheaply, doesn't stop work, and doesn't propose re-running or catting worker output.
