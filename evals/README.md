# Evals

Paper cases that check whether a change to the stack, or a swap of model, keeps the behaviour the skills ask for. Each case puts a candidate in a fixed situation, has it read named skill files, and asks for the message or artifact it would produce. A judge scores the output against a rubric the candidate never sees.

The method behind these runs is the file `eval-run.md` in the skill `agent-prose`. This folder holds the cases and the results.

## Layout

- `cases/<name>.md`: one case. `## Situation` and `## Task` form the candidate's prompt; `## Rubric` is for the judge only.
- `prompt.js`: prints a case's candidate prompt, or with `--judge` the judge's prompt.
- `results/<date>.md`: one file per run, with scores and the judge's notes.

## Re-run a case on two models

From a checkout of the commit under test. The candidate must not see this folder, so it runs in a separate worktree with `evals/` removed, and its outputs land outside that worktree.

```sh
case=standing-ok-close
out=../cand-out; mkdir -p "$out"
node evals/prompt.js "$case" > "$out/prompt.txt"
node evals/prompt.js "$case" --judge > "$out/judge.txt"

for arm in A:claude-opus-5-5 B:claude-sonnet-5-5; do
  label=${arm%%:*}; model=${arm#*:}
  for n in 1 2 3; do
    wt=../cand-$label$n
    git worktree add --detach "$wt" HEAD && rm -rf "$wt/evals"
    (cd "$wt" && claude -p --model "$model" --allowedTools Read Grep Glob < "$out/prompt.txt") > "$out/$label$n.md"
    git worktree remove --force "$wt"
  done
done
```

To compare two versions of the stack on one model instead, give each arm its own commit in `git worktree add` and the same `--model`.

## Grade

1. Shuffle the outputs and rename them so arm and model names are gone (`A1` can become `X3`). Keep the key to yourself.
2. Send `judge.txt` followed by every output, each under its label, to one fresh judge. Use another model family if one is available, else a fresh Claude session, and record which (`other-kind` or `same-kind-fresh`).
3. The judge scores each criterion 0, 0.5 or 1, so a case is out of 5, and lists the differences a user would notice.
4. Un-blind, then write `results/<date>.md`: per-case scores per arm, the length ratio, the judge's family, and one of the verdicts from `eval-run.md` (`VERIFIED`, `NOT VERIFIED`, `INCONCLUSIVE`). Fewer than three candidates per arm is `INCONCLUSIVE`, however close the scores.

## Results

| Date | Case | Opus 5.5 | Sonnet 5.5 | Judge's call | Sonnet length / Opus |
|---|---|---|---|---|---|
| 2026-11-21 | standing-ok-close | 4.5 | 4.5 | minor gaps | 0.77 |
| 2026-11-21 | mechanical-worker-packet-and-status | 5 | 5 | equivalent | 0.75 |
| 2026-11-21 | finish-line-leftovers-and-visuals | 3.5 | 3.5 | minor gaps | 0.76 |

One candidate per arm per case, so the run is `INCONCLUSIVE` under `eval-run.md`: read it as direction, not proof. Its scores are regraded from the judge's notes onto the scale above. Notes per case: `results/2026-11-21.md`. What the stack took from it: the Models section of the file `levels.md` in the skill `house-rules`.
