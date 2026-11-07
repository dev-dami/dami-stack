# Signal ladder

Climb from the top. Take the first rung that reproduces the failure, then harden it.

| Rung | Signal | Good fit |
|---|---|---|
| 1 | A failing test | The code is reachable from the test suite |
| 2 | A scripted HTTP call | A service or API misbehaves |
| 3 | A CLI run compared with known-good output | A batch job, build or converter |
| 4 | A headless browser script | The failure needs a real page |
| 5 | A replayed capture | You hold a recording of the bad traffic or input |
| 6 | A minimal harness | The failing part can be lifted out and driven alone |
| 7 | Randomised inputs | Nobody knows which input triggers it |
| 8 | Automated bisection | It worked at some past commit |
| 9 | A comparison across versions or configs | It works in one setup and fails in another |
| 10 | A script directing a human | Only a person can reach the state |

Write signals as Node scripts, or as a command the project already has, so they run under cmd.exe and PowerShell.

## Harden it

- **Faster.** Cut setup until a run takes seconds.
- **Sharper.** Assert the exact symptom the user reported, not a nearby error.
- **Repeatable.** Pin the clock, seed randomness, isolate the filesystem and the network.

## Intermittent failures

Raise the reproduction rate before trying anything else. Repeat the run, run copies in parallel, add stress, and narrow the timing window. Record the rate, for example `fails 14 of 50 runs`, because a fix is only proven by a rate that drops to zero over enough runs.

## Slowdowns

The signal is a measurement. Fix the baseline first: same machine, same input, several runs. Then bisect across commits or inputs. Assert a threshold, so the signal passes and fails on its own.

## Human-driven signals

Use this rung last. It can't meet "unattended" or "takes seconds", so say which requirements it misses.

Use the skill `walk-me-through` for its Node library, which runs on every OS. Use two of its actions only:

- show an instruction and wait
- ask and record, with answers printed as key-value pairs

Sign-ins stay instructions. A recorded answer reaches the agent, so never ask a person to type a password or token into the script.

## When no rung works

Stop before theorising. List each rung you tried and how it failed. Ask for one of: environment access, a redacted capture, or permission for temporary production instrumentation.
