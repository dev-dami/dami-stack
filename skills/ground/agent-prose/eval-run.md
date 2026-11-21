# Eval run

For showing that a cut, a rewrite or a model swap changed nothing that matters. Two arms: before and after, or model A and model B.

## Setup

1. **Blind the candidate.** No path, branch, folder name or prompt the candidate sees names the evaluation: no eval, judge, rubric, score or benchmark. The project's own test files are fine. The prompt is organic and shaped like a real user's request.
2. **Isolate.** N candidates per arm, three at least, each in its own clean worktree from the same commit, with the arm's documents installed and nothing else changed.
3. **Write the rubric** before any run: 3 to 6 criteria, each checkable from the output or the transcript. Only the judge sees it.

## Judging

4. **One judge, of another model family** where one is available, else a fresh agent of the same family labelled `same-kind-fresh`. It reads outputs under sanitized labels (`A1`, `B2`), never arm names, and scores each criterion per candidate.
5. **Grade chain-following from the transcript**: which skill files the candidate actually opened, and in what order. A candidate's claim that it followed a skill is `[reported]`.
6. **Record characters loaded per arm**: always-on text plus every file opened, from the transcripts.

## Verdict

- `VERIFIED`: every criterion holds in the new arm at least as often as in the old, across all candidates.
- `NOT VERIFIED`: a criterion holds less often, with the candidates named.
- `INCONCLUSIVE`: too few candidates, judge disagreement, or a broken run. Inconclusive is not a pass.

Report the verdict, the per-criterion counts per arm, characters loaded per arm, and the judge's family.

## Done when

- No candidate-visible path or prompt names the evaluation.
- Each arm ran at least three candidates in clean worktrees.
- The rubric was written before the runs and seen only by the judge.
- Chain-following was graded from transcripts.
- The verdict is one of the three words, with counts and characters loaded per arm.
