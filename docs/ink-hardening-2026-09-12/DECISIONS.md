# Focused inking pass

Baseline: `d1af50b`, following the adversarial release. User requested a quick Fable pass plus small improvements and reusable documentation, not a framework rewrite. Existing provider route and source-only permission used; no production artwork or keys shared.

## Disposition

1. **Fable 1, endpoint loss: accepted and browser-reproduced.** Append only a true owning pointer-up endpoint, preserving prior pressure. Baseline pixel oracle failed; fixed test passes.
2. **Fable 2, mid-stroke PNG: accepted and browser-reproduced.** Automatic preview waits while a stroke is active. Baseline observed one export during contact; fixed oracle requires zero during contact and a later export after release.
3. **Fable 3, whole-drawing save work: accepted.** Cache immutable rounded strokes; use an atomic sidecar revision in the existing IDB object store; serialize the fallback drawing once. Migration and out-of-order negative controls retained. The raw Node timings are illustrative single-run host work estimates, not actual IDB, DC-1 measurements or a guaranteed speedup. Reject the report's unmeasured assertion that this DC-1 is several times slower than the host.
4. **Fable 4, cancellation/contact-gap cause: unverified on hardware.** Defensive contact resumption now preserves later contact as a separate stroke, tested with no hover bridge. Blur/page hiding commits received points. No speculative pointercancel recovery or room-wide touch-action change: canvas already uses touch-action none, and real cancellation needs observation.

Keeper additionally reduced bounds reads from one per sample to one per batch and avoids replaying every stroke for CSS-only resize. These remove redundant work; no claim that the old bounds reads always forced expensive layout.

Fable advised against deferred mirrors because tests read them immediately and fallback must be synchronous. The implemented narrower variant defers only while contact is active **after IDB succeeds**; direct idle saves retain their previous contract and IDB-failure fallback still completes before the promise. A new independent browser oracle proves IDB commits during contact, optional mirroring waits, and only the latest revision is mirrored. Existing both-store-failure tests pass.

## Failure conditions

Reject a release if a received endpoint or completed stroke is lost, hover draws a bridge, erasing becomes whole-stroke deletion, reload/undo changes existing geometry, a stale revision wins, both-store failure permits destructive clearing, or required regression checks fail. Preserve baseline failures. Real DC-1 latency/palm claims remain BLOCKED without hardware measurements.

No cloud backup format, image generation prompt, frame styling or brush smoothing changed. Full-snapshot cloning/validation and large-library backup work remain potential costs; see [the reusable guide](../WEB-INKING.md).

## Release outcome

PASS: production build, 14 unit/server tests, 96 browser scenarios (zero skips or flaky cases). Evidence: `../evidence/qa-ink-hardening/` and `verification.json`.

Product commit `007f4e1` is deployed as Railway `8ec281e6-b877-4466-8fea-2219017c88b0` (SUCCESS) at https://anjan.app/incant. An isolated hosted browser verified the final endpoint, atomic revision record, identical pixels after reload and byte-identical application JavaScript versus the tested build. See `hosted-check.json`. Cloud writes were intercepted; no owner drawing, real speech, recipient message or paid image call was used.

Pre-change source is pushed as `incant-before-ink-hardening-2026-09-12` at `d1af50b`. Physical DC-1 pen/palm latency remains BLOCKED pending hands-on measurement. Reopen/reload the app before testing this update.
