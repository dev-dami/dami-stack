# Work orders and rejection records

## Work order

A work order is a `slice` card posted on the item. It may sit untouched for weeks while the code changes, so it states behaviour and contracts. It may name types and signatures, and it holds no file paths or line numbers.

```markdown
---
dami: card
id: c1
type: slice
needs: []
status: open
owner:
---
## Outcome
Now: exporting a report drops rows whose title contains a comma.
Wanted: every row appears, with the title quoted as the CSV standard requires.
## Accept
- A report with commas in titles exports with the same row count as the screen.
- The export opens in a spreadsheet with each title in one cell.
## Out
Changing column order or adding new export formats.
```

- `Outcome` gives current and desired behaviour. For a pull request, it states the remaining work on the submitted code.
- `Accept` holds criteria that can each be tested alone.
- `Out` holds explicit exclusions.

## Rejection record

One short design note per concept, with a durable reason, listing every request that asked for it. Keep records where the tracker document says. If it doesn't say, use the skill `repo-fitting`.

```markdown
# Rejected: offline mode

Reason (scope): the product promises live stock levels, and an offline view would show figures that may be wrong at the counter.

Requests: issue:212, issue:340, pr:388
```

Reasons are scope, technical or strategic. A temporary reason is a deferral, so it gets no record.

## Matching

Match by concept, not keyword: "work without internet" matches the record above. Surface every match to the maintainer, who picks one:

| Maintainer says | Do |
|---|---|
| Confirmed | Append the new request to the record and close the item |
| Reconsider | Remove the record and proceed with the item |
| Distinct | Treat the item as new |

A reversal doesn't reopen old items.

## Done when

- A work order has no paths or line numbers, and has current and desired behaviour, testable criteria and exclusions.
- A rejection record covers one concept, gives a durable reason and lists all requests.
- Every concept match was surfaced to the maintainer, and their choice was applied.
