# Peel, books, and hourglass

The parchment corner appears after a generated image has loaded and its reveal finishes. Dragging diagonally reveals its exact saved source, tapping toggles full comparison, arrow keys adjust the reveal, and Escape resets it. Cancelled pointer input restores the previous amount. Source and result bytes and the working drawing are unchanged. Historical comparisons use that creation's source, not the live draft.

The illustrated stack of books is a transparent hit target over the existing artwork. It opens a dedicated saved-spells dialog with day/session/bundle grouping. Each generation has Save and Share actions. Share constructs a File synchronously within the tap handler before navigator.canShare/navigator.share, retaining user activation. See https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share for platform semantics. Cancelling the OS sheet is not an error. Unsupported file sharing explains using Save and Files instead; the app never selects a recipient.

A small hourglass is shown only while casting. It pauses between 180-degree flips and is a button cancelling the active request. The existing serial guard rejects late results. Reduced-motion disables its animation. Mobile layout moves it away from the typewriter.

Browser validation uses synthetic data and mocked native-share handoff, including exact shared file bytes. This is distinct from observing a physical Android share sheet. Native device verification is recorded separately when available.

The first browser run caught real hit-target overlap on short screens. The typewriter's height is now bounded, the book hotspot sits above it, and the comparison corner is inset from the decorative bottom-right cluster. Initial failure evidence is retained separately from the final regression run.

The repeated-cast regression also caught a duplicate React key shared by the generated image and its new peel component. The peel now has a distinct key prefix; the focused test passed again with exactly one result and both archived generations. Earlier failed checks are retained as evidence, not reported as passing.

Physical DC-1 verification: tapped Share on a saved generation after production deployment. Android native chooser UI was observed (android:id/chooser_header, resolver_list, chooser_action_row); dismissed without selecting a recipient. Native screenshots contain owner artwork and remain private in /private/tmp. Books displayed the cloud backup status and saved creations successfully.
