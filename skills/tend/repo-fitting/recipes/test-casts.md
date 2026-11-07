# Test casts

Takes unsafe type casts out of TypeScript tests while letting a test supply only the fields it cares about. Test code only.

## Steps

1. Ask which test files hurt most, and whether any test needs deliberately wrong data.
2. Choose the helpers. If the user names a library, add it as a dev dependency through whichever package manager the project uses. Otherwise write a small local test-only file. The shape below is enough.
3. Show the helper and the list of files to rewrite. Get the OK.
4. Search the test files for casts, then replace them.

   | Found | Becomes |
   |---|---|
   | A single cast on partial data | `partialOf<T>(...)`, which still type-checks the fields given |
   | A double cast through `unknown` | `wrongOnPurpose<T>(...)`, which allows bad data and keeps editor completion |
   | A complete object that may loosen later | `fullOf<T>(...)`, which demands every field for now |

5. Add the imports and run the type check.
6. Prove it. Give a `partialOf` call a field with the wrong type and watch the type check fail. Revert. Run it clean.

## A local helper

```ts
type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export const partialOf = <T>(value: DeepPartial<T>): T => value as T;
export const wrongOnPurpose = <T>(value: DeepPartial<T> | {}): T => value as T;
export const fullOf = <T>(value: T): T => value;
```

The one cast left lives inside the helper, where it stays out of every test.

## Finished when

No test holds a double cast, no test fakes fields it doesn't care about, and the type check passes after failing on the real sample.
