# Look spike

For a question about how a screen should look and work.

## Look bar

For any user-facing visual deliverable, settled or not. Read and update the `taste:` lines in the user's prefs.

1. State the message in one line before any visuals.
2. A scout gathers 3 to 5 strong real references and names the design language they share.
3. Two or three workers build different directions, using established motion and component libraries.
4. A judge of another kind scores screenshots on message clarity, hierarchy, colour theory, text density, motion, and originality against a template look.
5. Share the winner and the runners-up as screenshots before reporting done.

## The variants

Build three by default and five at most. Host them on the real page, picked by a URL parameter such as `?variant=b`, so real data and real surroundings stay in view. Isolation hides problems. Add a temporary route only when no host page exists.

Variants must disagree on arrangement, on priority of information and on the primary control. Recolouring doesn't make a variant.

Share little code between them. Use the project's component system, and stub any data changes.

## The switcher

Add a small switcher that production never shows. It sits visibly apart from the design being judged, changes variant, and records the pick in the URL so a link reproduces it.

## Variants from different kinds

If the user wants variants from different agent kinds, use the race move with one entry per variant. Read the file `levels.md` in the skill `house-rules` first. Each brief holds the same question, the same page and its own URL parameter. The user keeps one entry, and no agent keeps it for them. At solo, build the variants yourself and say no race ran.

## After the verdict

Rewrite the winner properly in real code. Promoting spike code as it stands carries its shortcuts into the product.

## Done when

- For a user-facing visual: the message line, references, judge scores and shared screenshots exist.

- At least three variants run on the real page, or on a temporary route because no host exists, with five at most.
- Each pair of variants differs on arrangement, priority and primary control.
- The switcher works, keeps the choice in the URL, and is hidden in production.
- Data changes are stubbed.
- The plan for the winner is a rewrite, and the card or chart says so.
