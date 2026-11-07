# Logic spike

For a question about a state model: do these rules hold up when someone pushes on them?

## The file

One self-contained HTML file with no install, framework or server. A non-developer can double-click it, and you can email it.

Show the question at the top of the page, where anyone opening it sees it first.

## The logic

Keep the logic in a pure block of the file that never touches the DOM, shaped by the question: a reducer, a state machine, pure functions or a stateful object. The page calls this block and the block never calls the page, so it can be lifted into real code later.

## The page

- Labelled state, all of it on screen after each action.
- Action buttons worded in the domain: "Approve claim", not "setState".
- Walkthroughs that each reset to a known start, covering at least:
  - a normal path
  - a tricky case
  - a forbidden action, showing what the model does when someone tries it

A delivery example: "Normal: book, dispatch, deliver". "Tricky: rebook after a failed delivery". "Forbidden: deliver an order already refunded".

## Done when

- The file opens by double-click, with no install or server.
- The question is visible on the page.
- The logic block has no DOM access, and the page is its only caller.
- All buttons use domain words, and state is labelled.
- The three walkthroughs exist, each from a reset start, and you ran them.
