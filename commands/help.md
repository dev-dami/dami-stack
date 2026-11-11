---
description: What exists, and what fits now
argument-hint: [situation]
disable-model-invocation: true
---
Situation, if any: $ARGUMENTS

With no situation, print the guide below as it is and stop. Use no tools.

With a situation, print only the matching route and command from the guide, in two lines, then offer to start it. If nothing matches, use the skill `house-rules` and its file `routes.md`.

**dami stack.** Skills fire on their own. These commands start one now.

- `/dami:settle` interview you on a plan until no decision is left open
- `/dami:dig` find a fact from its source, with every claim traced
- `/dami:spike` settle a design question with throwaway code
- `/dami:chart` turn agreement into a plan and a graph of cards
- `/dami:build` build one card, test first, then check it
- `/dami:crew` run a chart with a team of agents
- `/dami:goal` agree a long-running goal and pursue it
- `/dami:fix` find the confirmed cause of a hard bug and fix it
- `/dami:check` check work against every request before calling it done
- `/dami:ship` check, then draft the PR
- `/dami:pass` hand work to another agent, session or person
- `/dami:debrief` turn a rough session into lasting fixes
- `/dami:learn` learn a topic over several sessions
- `/dami:connect` connect your VPS so agents can run there

**Routes**

- Small agreed work: failing-test-first > finish-line
- Idea to merge: question-tree > work-chart > crew-lead > merge-case
- Hard bug: root-cause-hunt > finish-line
- Work moving on: baton-pass

**Other agents:** the dami hub's `team_ask` asks Claude Code, Codex or OpenCode and returns the reply. `damistack team` shows who is working.
