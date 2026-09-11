# Pixel eraser verification

Date: 2026-09-11 UTC

The existing SketchCanvas recognizes pen button 5 or buttons bitmask 32 and paints a round paper-colored eraser path into the white-backed drawing. It removes only intersected pixels rather than deleting intersected ink strokes. Eraser paths are retained in drawing history for replay, undo/redo, and draft persistence. No runtime change or deployment was needed.

PASS — Three synthetic Chromium browser tests exercise button 5, bitmask 32, and the toolbar eraser. Each draws one continuous line, erases its center, asserts the endpoints retain their original pixels, checks undo and redo, reloads the draft, and draws new ink into the erased gap. Native pointer capture is stubbed for the two synthetic pen cases; these alone do not establish physical device behavior.

PASS (owner-reported physical UX) — With hosted Incant open, the owner reported “yes erase works well!” in response to the request to verify the DC-1 back-of-pen eraser. The connected device was identified by ADB as a DC_1. This is user-observed erasing evidence, not an instrumented pen latency measurement.

Full regression profile: qa-pixel-eraser/report.md (see its result rather than inferring success from this document).

PASS (initial owner impression) — The owner described pen latency as “totally workable” and said they were surprised how good it was. This is qualitative feedback, not measured latency or a complete performance gate. Palm rejection remains pending further physical testing at the owner's request.
