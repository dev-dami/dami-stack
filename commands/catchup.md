---
description: What changed since my last message, and what waits on me
disable-model-invocation: true
---
Catch the user up on everything since the last message they typed, so they can act from this reply alone. Agent reports, notifications and wakes are not their messages. Assume they remember their last message and nothing after it.

This turn is read-only. Change no code, post nothing, start nothing, and re-run nothing but reads: `git log`, `git status`, `gh pr view` or `gh pr checks`, the board, the `team_run` list. Check every number against its source.

Reply in this order:

1. One sentence naming what waits on the user, or `Nothing waits on you.`
2. Pictures the work already produced, such as screenshots, recordings, or a diagram drawn from facts you hold, sent through the prefs `show:` channel, else the host's file send. Invent no screen and no number. A visible change with no capture gets the line `No screenshot yet`, plus a sentence on what changed on screen.
3. One plain bullet per `Asked` item, marked done, running, failed or unchecked, with its evidence label. Name any bug found and fixed on the way. Nothing that still waits on the user is marked done.
4. Every call only the user can make (merge, approve, pick, an irreversible step, access you lack), riskiest first. Each gives its link, what it changes for users, the evidence, the risk even when low, and your pick. Work you can do yourself is not a call. Write `unknown` for a fact you lack.
5. `Links`: one raw https URL per line, never behind link text.

List every item: never cut or merge items to meet a word count, and the status shape's two-item limit doesn't apply here. Use plain words, with a hash, path or command only where the user needs it to act.
