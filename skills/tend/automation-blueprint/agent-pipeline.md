# Agent pipeline

The subject: remote machines where agents pick up tickets, or a timer, and carry the work through to merged code. You are designing this with the user. Nothing here gets built.

## Words

One concept gets one word. When the conversation slides to another word, say so and bring it back.

| Term | Means |
|---|---|
| task | A job written once, then executed many times |
| run | A single execution on a throwaway machine. It finishes instead of sitting and waiting for someone. When a person acts later, that starts a fresh run |
| tracker | Where people meet the system |
| ticket source | Anything that files tickets |
| git host | Holds code, pull requests and checks |
| orchestrator | Receives triggers, launches runs, keeps their status |
| runner | Provides the machine and executes the agent |
| observability | Optional. Shows what a run did |

A run keeps nothing. Whatever must outlast it goes in the tracker, the git host or the orchestrator. A single product may cover more than one role.

## Method

1. Start with what actually hurts today. The system comes later.
2. Choose the task that relieves it, from the patterns below or a new one.
3. Automate triggers one by one, because every new trigger is new risk. Throttle each one, limit how often any loop can go round, and keep a person reviewing all pull requests.
4. Fill the roles. Pay for services, write your own tasks, and lean towards a tracker that already exists. Use the skill `source-trail` to research what is on the market now.
5. Test your picks against the traps below.

## Task patterns

These tend to link into a chain.

- Sort incoming tickets.
- Take a ticket as far as a draft pull request.
- Review that draft.
- Rework what the review raised and nothing else, with a limit on attempts.
- Break up a spec that proved too large.
- Make the checks slightly stricter every day.
- Convert user complaints and monitoring alerts into tickets, merging duplicates.
- Try to repair a failed run. Never let one repair trigger another, and a person always reviews it.
- List refactor ideas for people to choose from.
- Pull a sample of merged work into a retrospective.

## Three controls

1. Checks that give the same answer every time.
2. An automated reviewer that has seen none of the build.
3. People, and whatever they catch turns into another check.

## Judging products

| Role | Ask |
|---|---|
| Tracker | What can it trigger on? Which fields can route work? Can a bot reply in comments under its own identity? Does it ship its own agents? Can outsiders file? Who hosts it? |
| Git host | Are events signed? How do bots authenticate? Which gates does each plan include? What are the rate limits? |
| Runner | Who drives the agent's loop, and who owns the machine? How does a run begin? What are its limits and its pricing shape? Is it truly throwaway? What can it reach on the network, and which secrets? This can differ from one run to the next |
| Observability | What do you need to see: a log of runs, the agent's trace, or that trace tied into the rest of the system? How does data leave? Can you self-host it? What are the cost and retention? Choosing none on purpose is fine at the start |

## Traps

Each of these held true at some point. Confirm them against current docs before relying on them.

- The token GitHub gives a workflow by default can't set off another workflow, so runs need an app's identity.
- The gate you want may sit behind a paid plan.
- Rate limits change with who is calling.
- A tracker that belongs to a suite may send events down two separate channels.
- Some built-in agents look at a ticket once, when assigned, and never again.
- Webhooks can demand a quick reply, or show up in bunches.
- Logs from a model gateway don't show tool calls.

## Design file

One Markdown file: the role table, then a section per task and per ticket source.

| Item | Must state |
|---|---|
| Task | Its trigger, inputs, outputs, what it sets off, where a person steps in, its guard against doing the same work twice |
| Ticket source | Its guard against filing the same ticket twice |

## Finished when

No role is blank (a deliberate none counts), and every task and ticket source fills in its row.
