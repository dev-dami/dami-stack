# Commit gate

Holds a commit back until format, types and tests are clean. Worth suggesting to any repo with nothing guarding its commits.

## Detect the toolchain

Read lockfiles and manifests. Use the ecosystem's usual tools, and prefer whatever the repo already has.

| Signs | Package manager | Hook manager | Staged formatting | Full checks |
|---|---|---|---|---|
| `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`, `package-lock.json`, or none of these beside `package.json` (npm) | the one the lockfile names | Husky | lint-staged with Prettier | `typecheck`, `test` scripts |
| `pyproject.toml`, `uv.lock`, `poetry.lock` | the one the lockfile names | pre-commit | a formatter hook, commonly Ruff | type checker and pytest, if configured |
| `Cargo.lock` | cargo | a pre-commit tool, or a plain git hook | `cargo fmt` | `cargo clippy`, `cargo test` |
| `go.mod` | go | a pre-commit tool, or a plain git hook | `gofmt` | `go vet`, `go test ./...` |

For any other ecosystem, name the local equivalents and show them before installing.

## Steps

1. Show what will be installed and which checks will run. Get the OK.
2. Install the tools as development dependencies with the repo's package manager.
3. Set the hook's order: format the staged files first, since that takes a moment, then run the full type check and tests.
4. Include only checks the repo has. For each one left out, say which and why. Never invent a script.
5. Leave existing formatter config alone. Add one only where there is none.
6. For JavaScript, confirm the `prepare` script installs the hook on a fresh clone.
7. Verify that the expected files exist, then run the hook for real.
8. Stage a badly formatted line or a failing test and attempt a commit: it must refuse. Revert it.
9. With an OK, commit the setup files only. The hook runs on this commit, which is its final proof.

## Finished when

The hook refused a real sample, then passed on its own commit, and the report lists every check included or left out.
