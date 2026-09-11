# Typewriter keyboard entrance

Owner reported a jarring keyboard flash on DC-1. Isolated browser instrumentation reproduced two focus events when opening the speech bubble: Close typed spell, then Type your spell. showModal's initial focus was followed by an explicit second focus call. See https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog for dialog autofocus semantics.

The textarea now receives initial dialog autofocus. A preventScroll fallback runs only if initial focus did not reach it. The illustrated room holds its current height while the bubble is open, avoiding a canvas resize when Android's keyboard changes the viewport. Closing the dialog releases that height. The bubble's keyboard inset eases over 180ms; reduced motion disables this transition.

The regression test observes the focus event trail and checks that the temporary height is released on close. This proves removal of the app's double focus transition, not elimination of every physical DC-1 display flash. Native keyboard entrance and reflective-display refresh still need owner validation. No claim of physical before/after latency is made.

First regression run caught that React's autoFocus prop did not provide the native dialog attribute needed here; the focus trace still contained both elements. The implementation now sets the native autofocus attribute immediately before showModal. Focused browser test PASS: exactly Type your spell, with the height lock released on dismissal. The initial failed profile is retained as qa-keyboard-entry; the final profile uses a separate directory.

Final repository profile PASS: production build, seven unit contracts, 31 browser scenarios. Deployment cedce3a2-90d3-4069-8ad4-9d08f61ab23f SUCCESS. Native device feel remains a manual check.
