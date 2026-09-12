# Incant inking audit (frozen snapshot, 2026-09-12)

Scope: `web/src/components/incant/SketchCanvas.tsx`, `web/src/lib/drawing.ts`,
`web/src/lib/durable-draft.ts`, the autosave effect in
`web/src/components/incant/IncantApp.tsx`, `web/src/lib/native-interactions.ts`,
`web/src/styles.css` (touch-action only), and tests `input-reliability`,
`native-interactions`, `durable-draft-negative`. No app source was changed.
One synthetic Node check was written and run in this lane
(`check-save-cost.mjs`); no browser, device, storage or network was used.
The DC-1 hardware and its Chrome build were not examined; anything about them
below is labelled hypothesis.

Symptom under review: intermittent big pauses, and missing parts of strokes,
on DC-1 Chrome.

## Summary

| # | Finding | Status | Symptom it explains |
|---|---------|--------|---------------------|
| 1 | The `pointerup` terminal sample is never appended to the stroke | source-confirmed | short missing tail on every stroke |
| 2 | Autosave encodes a full-size PNG on the main thread 500 ms after each save, and can land mid-stroke | source-confirmed | intermittent pause, timing dependent |
| 3 | Every stroke commit does O(whole drawing) main-thread work: read+validate old draft, clone, round, stringify twice to localStorage | source-confirmed, measured | pauses that grow over a session |
| 4 | After a `pointercancel` or a no-contact `pointermove`, the rest of the pen-down is silently dropped; ancestors of the canvas allow touch gestures | consequence source-confirmed, trigger is hardware hypothesis | large missing stroke sections |

Fixes 1 to 3 are worth doing on the source alone. Fix 4 needs a device trace
first, but its two parts are small and safe.

Existing safety nets that must keep working: pixel erasing (`segment` with
`eraser`), undo/redo (`strokes`/`future` stacks), durable reload
(`loadDurableDraft` and the localStorage fallback envelope), layout, and the
stroke intent rules encoded in `native-interactions.e2e.ts`. Each fix below
states how it leaves these untouched.

---

## 1. Terminal sample dropped (source-confirmed)

**Evidence.** `SketchCanvas.tsx:308-312`: `finish` commits the stroke without
reading the event position. `pointerup` is wired to `finish`
(`SketchCanvas.tsx:315`). Only `pointermove` appends points
(`SketchCanvas.tsx:299-306`). The W3C Pointer Events model treats `pointerup`
as a real sample carrying the final contact coordinates, and Chrome commonly
delivers it at a position past the last `pointermove`. The synthetic check
shows the effect for a plausible gap:

```
terminal sample: last appended=(0.3,0.15) pointerup=(0.34,0.17) -> 65 px of tail never inked/saved
```

The tail is missing both from the canvas and from the saved draft, so the
reload shows the same truncation. Quick flicks and letter endings are where
users notice it.

**Smallest fix.** In `finish`, when the event is a `pointerup` for the active
pointer and a stroke is open, append `point(e)` and draw the segment before
`commitCurrent()`. Reuse the last point's pressure rather than
`e.pressure || 0.45`, because Chrome reports pressure 0 on `pointerup`.
Do not do this for `pointercancel`, `lostpointercapture`, or the pen
no-contact branch at `SketchCanvas.tsx:282-286`, which is the "never append a
hover sample" rule.

Eraser strokes go through the same `segment` call so pixel erasing is
unchanged. Undo/redo only see one more point in the committed stroke.

**Regression oracle.** New Playwright case in `native-interactions.e2e.ts`
using the existing `send()` helper pattern: `pointerdown` (buttons 1) at
x=0.3, `pointermove` at x=0.4, `pointerup` (buttons 0) at x=0.6. Assert the
pixel at x=0.5 is ink (`getImageData` red channel below 100, as in
`durable-draft-negative.e2e.ts:42-52`), and the saved stroke in
`incant-drawing-v2` has three points with the last x near 0.6. Negative
control: the existing test at `native-interactions.e2e.ts:126-168` sends
`pointerup` after a barrel-only move; its PNG must still equal `ink`, which
holds because the stroke is already closed when that `pointerup` arrives.

---

## 2. Autosave PNG encoding on the main thread, mid-stroke (source-confirmed)

**Evidence.** `IncantApp.tsx:241-268`: on every `revision` change a 500 ms
timer calls `sketch.current.exportPng()`, which is
`canvas.toDataURL("image/png")` (`SketchCanvas.tsx:194`) on a canvas of up to
1536 by 1536 pixels. PNG encoding plus base64 in `toDataURL` is synchronous on
the main thread. `revision` increments only after the IndexedDB save resolves
(`SketchCanvas.tsx:115-118`, `IncantApp.tsx:798`), so the 500 ms window starts
after the previous stroke's save, not at pen lift. If the next stroke begins
inside that window and is still in progress when the timer fires, the encode
runs during `pointermove` delivery. Chrome coalesces the samples that arrive
during the block, so ink is not lost, but the user sees the line freeze and
then jump. The effect is intermittent because it depends on the gap between
strokes, which matches the report.

The archive write itself (`archive.ts:77-136`) is IndexedDB and async; the
encode is the cost.

**Smallest fix.** Add `isInking: () => pointer.current !== null` to
`SketchCanvasHandle`. In the timer callback, if `isInking()` is true, re-arm
the same 500 ms timer instead of exporting. Nothing else changes: the archive
still receives the same data URL string, so the `old.sketch === sketch`
comparison in `archive.ts:92` keeps working. Optional follow-up, not part of
the smallest fix: `canvas.toBlob` lets Chrome encode off the main thread, but
the resulting base64 is not guaranteed byte-identical to `toDataURL`, which
would affect that equality check.

**Regression oracle.** Playwright: via `addInitScript`, wrap
`HTMLCanvasElement.prototype.toDataURL` to record `performance.now()` for each
call. Draw one stroke with CDP pen events, wait 100 ms, then draw a second
stroke with moves spread over 900 ms before `mouseReleased`. Assert no
`toDataURL` call timestamp falls between the second stroke's press and release,
and that one call happens within 1.5 s after release. Existing archive tests
that rely on the 500 ms autosave still pass because the timer only re-arms.

---

## 3. O(whole drawing) main-thread work per stroke commit (source-confirmed, measured)

**Evidence.** Each `commitCurrent` runs `changed()` (`SketchCanvas.tsx:107-131`):

- `roundedDrawing()` copies every point of every stroke (`SketchCanvas.tsx:98-106`).
- `saveDurableDraft` validates every point (`durable-draft.ts:99`, `drawing.ts:5-28`).
- Inside the transaction it `get`s the entire old draft just to compare
  `revision`, deserialising it on the main thread, then validates all of it
  again (`durable-draft.ts:108-111`), then `put`s the new draft, which
  structured-clones it (`durable-draft.ts:113`).
- After the transaction, `mirror()` stringifies the draft twice and writes both
  to localStorage synchronously (`durable-draft.ts:86-96`). This happens in a
  later task, so it can land during the next stroke.

Synthetic timing on this host, one commit, `node check-save-cost.mjs`:

```
strokes  pts/stroke  totalPts   round  validate  clone(old+new)  stringify(env+drawing)  JSON KB  TOTAL/commit
     50         120      6000     0.6       1.1             8.6                     1.5      409       11.8 ms
    200         150     30000     2.1       2.4            43.3                     8.0     2042       55.8 ms
    500         200    100000     4.3       8.4           139.0                    23.2     6798      174.9 ms
   1000         240    240000     6.4       8.9           412.1                    69.0    16304      496.4 ms
```

A DC-1 class tablet is several times slower than this host, and the
localStorage write cost itself is not included. Two things follow. The pause
after each pen lift grows with the drawing, which reads as "intermittent big
pauses" in a long session. And the JSON column shows the two localStorage
copies pass typical per-origin quota around a few hundred strokes, after which
every commit still stringifies several megabytes only for `setItem` to throw
and be swallowed (`durable-draft.ts:127-133`).

Reading the old draft is the largest single term, roughly half of the clone
column.

**Smallest fix.** Two local changes in `durable-draft.ts`, no schema
migration:

1. In the same readwrite transaction, also `put(draft.revision, "revision")`.
   For the compare-and-set, `get("revision")` first; only if it is undefined
   fall back to reading `CURRENT` once (pre-existing installs). Compare with
   `Number.isSafeInteger(old)` rather than validating the whole old drawing.
2. In `mirror()`, stringify the drawing once and build the envelope by string
   concatenation, so the two keys share one serialisation.

Optional third change in `SketchCanvas.tsx`: cache the rounded form per
stroke object in a `WeakMap`, since committed strokes are never mutated and
undo/redo move the same objects between stacks.

Deferring `mirror()` to idle time was considered and rejected for the smallest
fix: `durable-draft-negative.e2e.ts:72-85` and `input-reliability.e2e.ts:159-167`
read localStorage immediately after the save promise, and the IndexedDB
failure path must still surface the mirror error synchronously.

**Regression oracle.** Keep `durable-draft-negative.e2e.ts` "overlapping saves
cannot let an older revision regress either store" and "a corrupt new fallback
cannot hide a valid old-format draft" as the reload and monotonicity oracles.
Add one Playwright case: seed a 500-stroke, 200-point draft through
`saveDurableDraft`, install a `PerformanceObserver` for `longtask` plus a
counter around `JSON.stringify` for strings over 100 KB, then save revision+1.
Assert at most one large stringify per save, and that the save's long tasks
total under a chosen budget (set the threshold from a baseline run on the
current source so the assertion is a ratio, not an absolute).

---

## 4. Stroke remainder dropped after cancel or no-contact move (consequence confirmed; trigger is hardware hypothesis)

**Evidence in source.** `SketchCanvas.tsx:279-312`: once `finish` has run for
the active pointer, `pointer.current` is null and `pendingPen` is null unless
the barrel button is held (`SketchCanvas.tsx:284`). Every later contact
`pointermove` for the same pen-down hits `e.pointerId !== pointer.current` and
returns. Chrome does not send a new `pointerdown` until the pen lifts and
touches again, so the whole remainder of that pen-down is neither drawn nor
saved. This is the only path in the file that discards an arbitrarily long
piece of a stroke, so it is the best source-side match for "missing parts of
strokes". The committed part is kept, which matches the tests at
`native-interactions.e2e.ts:169-211`.

Two triggers reach that path:

- `pointercancel` (`SketchCanvas.tsx:316`). `touch-action: none` is set on the
  canvas and the wand only (`SketchCanvas.tsx:333`, `styles.css:393`). The
  parchment's ancestors, `.paper-wrap`, `.desk` and the room, have no
  `touch-action` rule (`styles.css:177-260`). Hypothesis: a resting palm on the
  frame outside the canvas starts a browser touch gesture, and Chrome on
  Android cancels the whole active pointer sequence, pen included. Not
  verifiable here.
- A `pointermove` for the active pen with `buttons === 0` and no barrel
  (`SketchCanvas.tsx:282-286`). By the Pointer Events model, a tip release is
  a `pointerup`, so a mid-press `buttons === 0` move is non-conformant input.
  Hypothesis: the DC-1 pen driver or its Chrome build emits one on light
  pressure. Not verifiable here.

**Smallest fix.** Two independent lines:

1. `styles.css`: add `touch-action: none` to `.paper-wrap`. It already has
   `overflow: hidden` (`styles.css:256`), so it is not a scroll container and
   layout does not change. Do not apply it to the room, which has scrolling
   layouts elsewhere in the stylesheet.
2. `SketchCanvas.tsx:284`: after the no-contact `finish`, set
   `pendingPen = e.pointerId` unconditionally instead of only when the barrel
   is held. The existing re-down path at `SketchCanvas.tsx:287-294` then starts
   a new stroke at the first contact sample, so a glitch costs a one-sample
   gap instead of the rest of the stroke. A real `pointerup` still clears
   `pendingPen` (`SketchCanvas.tsx:309`), so hover after a true lift still
   never inks. Barrel and tip chords behave exactly as today.

This does not help after a genuine `pointercancel`, because Chrome suppresses
further samples for that sequence; that case is what change 1 is for.

**Regression oracle.** Extend `native-interactions.e2e.ts` with the `send()`
helper: `pointerdown` (buttons 1, pressure 0.5) at x=0.2, `pointermove` at
x=0.3, `pointermove` (buttons 0, pressure 0) at x=0.4, `pointermove`
(buttons 1, pressure 0.5) at x=0.6, `pointermove` at x=0.8, `pointerup`.
Assert ink exists at x=0.7 and none at x=0.4, and that the saved draft has two
strokes. Then reload and assert the PNG is unchanged. Negative control: the
existing "barrel-first chord ... no hover trail" test must still pass
unchanged. For the CSS change, a Playwright check that
`getComputedStyle(document.querySelector(".paper-wrap")).touchAction === "none"`
and that `canvas.getBoundingClientRect()` is unchanged before and after.

---

## Recommended field diagnostic before fix 4

Because both fix 4 triggers are hypotheses, one device trace decides it. A
`?trace=ink` query flag that records, into a ring buffer exposed on `window`,
each pointer event's `type`, `buttons`, `pressure`, `timeStamp`, coalesced
count, and any `longtask` entries over 50 ms. One session on the DC-1 with a
resting palm answers: are there `pointercancel` events, are there
`buttons === 0` moves inside a press, and do long tasks line up with pen
lifts (fix 3) or with the 500 ms mark after a lift (fix 2).

## Not changed, checked and left alone

- `getCoalescedEvents` is already used correctly (`SketchCanvas.tsx:299-301`),
  with the empty-array fallback, so main-thread blocks do not lose samples.
- `getBoundingClientRect` per coalesced sample (`SketchCanvas.tsx:227`) is
  cheap while no layout is dirty; nothing in the move path dirties layout.
- Effect cleanup on `tool`/`locked` change commits an open stroke
  (`SketchCanvas.tsx:318-326`). `locked` is `busy || !!active`
  (`IncantApp.tsx:795`), which does not flip during ordinary drawing.
- The 20000 point and 2000 stroke caps match `validDrawing`, so a saved draft
  is never rejected on reload for size.

## Files in this lane

- `REVIEW.md` (this report)
- `check-save-cost.mjs` (synthetic timing and terminal-sample check; run with `node check-save-cost.mjs`)
