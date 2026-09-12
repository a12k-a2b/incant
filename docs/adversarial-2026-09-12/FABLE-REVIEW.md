# Incant adversarial review (Fable lane, baseline 46a4faa)

Reviewer: Fable 5.1, independent lane. Date: 2026-09-12. Frozen source under `web/`.
No app source was modified. No hardware, no live provider, no production storage was touched.

## Summary

Two defects were reproduced in the lane browser with synthetic tests. Both are
about losing ink the user can see on the parchment.

| ID | Sev | Archetype | Status | One line |
|----|-----|-----------|--------|----------|
| F1 | P1 | 2 (palm-heavy stylus sketcher) | Reproduced | A touch landing on the wand while the pen is mid-stroke starts the wand and cuts the stroke. |
| F2 | P1 | 5 (keeper of creations) | Reproduced | When localStorage is full, new ink stays on screen and is warned about, but reload drops it and the archive's current pair reverts to the stale sketch. |
| F3 | P3 | 5 | Measured | Draft strokes serialise at about 57 bytes per point at full double precision; the whole drawing is rewritten on every stroke. |
| H1..H5 | unrated | 1, 3, 4, 6, 7 | BLOCKED | Five further hypotheses were turned into synthetic tests but never executed. See "Blocked". |

The existing e2e suite recorded in `browser-tests.json` (written 12:20 by the earlier
run of this lane) shows 60 expected, 0 unexpected, 0 flaky. That is narrow coverage,
not a quality claim. It has a "palm input ignored" case for the parchment and an
"archive failure cannot clear the sketch" case, but nothing for a palm on the wand
during a stroke or for a failed draft save followed by reload.

## Commands and results actually recorded

Run by the earlier pass of this same lane, from `web/`, against the keyless local
server on port 5181 (`review.playwright.config.ts`, Playwright 1.63.0, 1 worker):

```
npx playwright test -c review.playwright.config.ts \
  review-tests/palm-wand.review.ts review-tests/storage-growth.review.ts
```

Result (`review-browser-tests.json`, stats): expected 0, unexpected 2, skipped 0.

```
palm-wand.review.ts  > touch on the wand mid pen stroke cuts the stroke and locks the page
  stdout: ink at 30% (before palm): 41 | ink at 55% (after palm): 255
  stdout: wand state while palm rests: Connecting… keep holding
  FAIL palm-wand.review.ts:71  expect(pixels[1]).toBeLessThan(100)  Received: 255

storage-growth.review.ts > bytes per stroke point and behaviour when the draft no longer fits
  stdout: draft stats: {"bytes":11429,"points":201,"perPoint":56.86,...}
  stdout: points before a 5 MiB localStorage budget: ~92205 (≈6 min of continuous 240 Hz ink)
  stdout: filler written: {"chunks":38,"bytes":5230592}
  stdout: second stroke visible on canvas: true | draft changed: false
  stdout: room message: "This browser could not save your draft. Download the sketch before leaving."
  stdout: strokes after reload: 1 | second stroke survives reload: false
  stdout: archive pairs: 1 | archived sketch equals post-quota ink: false | archived sketch equals stale (pre-quota) ink: true
  FAIL storage-growth.review.ts:112  expect(pixelsAfterReload).toBeLessThan(100)  Received: 255
```

In both files the assertions before the failing line passed, so the failure is the
oracle, not the setup. No test was run in this finishing pass.

## Findings

### F1 (P1, reproduced) Palm on the wand during a pen stroke starts the wand and cuts the stroke

- Archetype: 2. Also hurts 1 (accidental mode change) and 4 (a stuck "Connecting…" while the palm rests).
- Evidence: `review-browser-tests.json` lines 78-141; test `web/review-tests/palm-wand.review.ts` lines 37-71.
- Trigger: draw with a pen pointer on the parchment. While the pen is still down, dispatch a
  non-primary `touch` pointerdown on `.voice-wand` (the palm). Continue the pen stroke, lift.
- Expected: the pen stroke continues unbroken and the wand stays idle. A resting palm is not a press.
- Actual: `main` gains `phase-connecting`, the wand label reads "Connecting… keep holding", and
  the canvas pixel at 55% of the width is untouched (255) although the pen kept moving.
- Causality (source): the parchment filters pointer types and honours a `locked` gate at
  `web/src/components/incant/SketchCanvas.tsx:191-199`. A grep for `pointerType` across
  `web/src` matches only that file, so the wand button accepts a touch pointerdown without
  any pointer-type or "pen in contact" check. Once the wand enters connecting, the parchment
  is locked and the in-flight stroke stops. I did not read the wand component itself in this
  pass, so which line locks the canvas is inferred from the observed `phase-connecting`, not cited.
- Why current tests miss it: `desk.e2e.ts` "palm input ignored" only puts the palm on the
  parchment, never on a frame control during an active stroke.
- Smallest fix: in the wand's pointerdown, return early when a pen pointer is currently in
  contact on the parchment (expose the canvas `pointer.current !== null` state, for example
  as a `data-inking` attribute on `main`), or when `e.pointerType === "touch" && !e.isPrimary`.
  Keep finger taps on the wand working when no pen is down, because tap/speak/tap is a feature.
- Oracle: `palm-wand.review.ts:71` (pixel at 55% < 100) and wand `aria-label` not matching
  /Connecting/ while the pen is down. Independent check: after the pen lifts, a real tap on the
  wand must still reach `phase-connecting`.
- Limit: synthetic PointerEvents in Chromium with `setPointerCapture` stubbed. Real DC-1
  palm rejection at the driver level was not tested and may hide this on hardware.

### F2 (P1, reproduced) Full localStorage: warned ink is lost on reload and the archive reverts to the stale sketch

- Archetype: 5. Also 4 (background/foreground reload on a tablet).
- Evidence: `review-browser-tests.json` lines 155-235; test `web/review-tests/storage-growth.review.ts` lines 39-112.
- Trigger: fill localStorage to within a few KB of quota, draw one more stroke, wait past the
  archive debounce, reload.
- Expected: no silent loss. Ink that the user saw and was told to download either survives
  reload or the archive copy that was written keeps the newer sketch.
- Actual: the stroke is visible (`pixels` 41), the draft key is unchanged, the room message
  appears. After reload the draft has 1 stroke and the pixel is 255. The archive "current"
  pair equals the pre-quota PNG, not the post-quota PNG, so the newer image that had been
  archived was overwritten by the reload's re-save from the stale localStorage draft.
- Causality (source): `SketchCanvas.tsx:79-92` `changed()` wraps the two `setItem` calls in a
  try/catch, reports the message, then continues with `onChange()`. Strokes live only in
  `strokes.current`. On mount, `SketchCanvas.tsx:93-98` reads the localStorage draft and
  replaces memory. The archive path that then re-seals the current pair from that stale draft
  was described in the test comment from the earlier pass ("archiveSketch does not depend on
  localStorage") and is confirmed by the observed archive contents, but I did not re-read
  `web/src/lib/archive.ts` in this pass.
- Why current tests miss it: `archive.e2e.ts` "archive failure cannot clear the sketch" makes
  the archive fail. Nothing makes the draft save fail and then reloads.
- Smallest fix: in the catch branch, set a `draftDirty` flag and write the drawing to the same
  IndexedDB store the archive uses under a draft key; on mount prefer the IndexedDB draft when
  it is newer than the localStorage one. Do not re-seal the archive current pair from a
  localStorage draft while `draftDirty` is set.
- Oracle: `storage-growth.review.ts:112` plus `archived.sketch === postQuotaPng` at line 107.
- Limit: quota was forced by filler keys; real quota depends on the tablet browser.

### F3 (P3, measured) Draft serialisation cost

- Archetype: 5 (hours of sketches).
- Evidence: stdout in `review-browser-tests.json` line 195-198: 11429 bytes for 201 points
  (about 57 bytes per point), `x`/`y` at full double precision, whole drawing rewritten on
  each stroke (`SketchCanvas.tsx:81`).
- Impact: about 92k points fit a 5 MiB budget, roughly six minutes of continuous 240 Hz ink.
  For a realistic sketch this is fine. Combined with F2 it shortens the road to loss.
- Smallest fix: round coordinates and pressure to 4 decimals when serialising.
- Oracle: `perPoint` in the same test below 30.

## Blocked: hypotheses with authored tests that were never run

These files exist in `web/review-tests/` and encode risks noted during the earlier source pass.
They have no recorded result, so nothing here is confirmed or refuted. I did not re-read the
relevant source in this pass, so they are hypotheses, not source-confirmed findings.

- H1 `voice-words.review.ts` (archetype 3): a silent wand press may erase a typed spell that
  was never cast; a click activation or Enter tap may be treated as an empty hold.
- H2 `overlay-hit-areas.review.ts` (archetype 1, 2): a short mark in the top-right of the
  parchment may hit the moon and wipe the page with "0 generations" and no open button.
  Also a hit-map of parchment overlays per layout.
- H3 `owl-quota.review.ts`, `owl-quota.review.unit.ts` (archetype 6): viewing results may
  upload owl letters without any share, re-uploading on reload; a daily cap may count revoked
  and expired letters.
- H4 `error-copy.review.ts` (archetype 1, 4): offline cast and microphone denial may surface
  raw browser strings ("Failed to fetch", "Permission denied").
- H5 `after-cast.review.ts` (archetype 3, 7): a result may lock and hide the canvas with only
  voice, moon or a new cast releasing it, and there may be no undo in the immersive room.
- `cloud-cost.review.ts` (archetype 5): a sync cost measurement. No result.

Reason for BLOCKED: the earlier pass exhausted its budget after running only the two files
above. This finishing pass was instructed not to run further tests.

## Archetype coverage

1. Curious first-time user: only H2 and H4 hypotheses. No finding confirmed.
2. Stylus / palm-heavy sketcher: F1 confirmed. Overlay hit areas (H2) blocked.
3. Storyteller: H1, H5 blocked. Existing suite covers recasts with the exact sketch.
4. Impatient on weak Wi-Fi: existing suite covers cancel, late result, early release. H4 blocked.
5. Keeper: F2 confirmed, F3 measured. Cloud cost blocked.
6. Sender and recipient: H3 blocked. Existing owl tests passed in the recorded run.
7. Immersive / accessibility critic: only reduced-motion cases in the existing suite. Nothing new.

## Limits

- No DC-1 hardware, no real stylus, no live provider, no production storage. Everything is
  headless Chromium with synthetic pointer events and localStorage filler.
- `browser-tests.json` was produced by the earlier pass of this lane. I read it; I did not re-run it.
- Source reading in this pass was limited to `SketchCanvas.tsx` fragments and `drawing.ts`.
  The wand component and `archive.ts` were not re-read, as stated in F1 and F2.
- One shell read of the test directory was denied by the harness; the files were read with
  the search tool instead. No other blocked actions.
