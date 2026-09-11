# Making a DC-1 PWA feel native: pen and browser gestures

## Incident and evidence, 2026-09-11

Owner reported an intermittent Chrome long-press menu while the stylus was near the screen. The first local investigation ran for roughly two minutes before dispatching two Sol investigators and two Grok Build reviewers. Grok received source-only packets through the already-authorized subscription CLI; no credentials, user sketches, screenshots, or private archive content were sent.

Reproduced against the pre-fix app in isolated Chromium:

- A cancelable contextmenu event was unprevented on canvas, frame, and help; the wand prevented it.
- CDP pen input with right button, buttons=2, force=0 painted a dot. That is an injected barrel/right press, **not a reproduction of physical hover**.
- Canvas `pointerdown` rejected secondary mouse buttons but admitted every pen button. The accepted event immediately painted, then entered saved drawing history.

The actual DC-1 cause remains unverified: possibilities include a button event, a light contact, palm/finger long press, or a different Chrome menu path. A later device check returned no connected devices; `adb -s JP5R02349 shell getevent -lp` reported device not found. Do not call that a hardware pass.

## Shipped design

**Separate ink admission from browser menus.** The drawing surface now rejects barrel-only pen events before capturing or painting. It uses contact bits rather than `buttons === 1`: primary tip bit 1, eraser bit 32, barrel bit 2. The existing button-only eraser compatibility remains. First tip samples may have zero pressure, so pressure is not a general contact gate.

**Handle button changes during hover/contact.** After a rejected barrel press in the canvas, tip contact can arrive as a pointermove with buttons=3. That begins ink at the contact position. If tip contact clears while barrel stays held (buttons=2), the stroke finishes before the hover sample can be painted. Both barrel-first and tip-first sequences have regression tests. In-place tip-to-eraser inversion without a release remains a separate, unverified edge case.

**Preserve accepted work during interruption.** We deliberately retain the existing policy of saving legitimate partial ink on pointercancel/lost capture. Some reviewers proposed discarding it; we did not introduce that potentially lossy behavior change for this fix. Rejected barrel input never creates a stroke, so cancellation cannot save that phantom dot. This is a product decision, not a universal rule for all canvas apps.

**Let the application own menus on application surfaces.** A capture listener on Incant's main element prevents contextmenu on canvas, frame, images, help and other non-native surfaces. The former wand-only protection left all other surfaces exposed. The handler does not stop propagation or intercept global pointer, touch, wheel, click or keyboard events.

**Keep native editing islands.** Inputs, textareas, selects/options, contenteditable, links, native audio/video, and `data-native-context-menu` opt-outs retain native context menus. The explicit opt-out also retains selection and drag behavior. Selection/drag suppression is limited to the illustrated desk (excluding those controls); image dragging is suppressed throughout the room. Dialog prose remains selectable and dialogs still scroll. Save and Share remain the image export paths.

## What to reuse in another DC-1 PWA

1. Treat pen hover, tip contact, eraser, side buttons and button chords as separate input states. Mouse-only button filtering is insufficient.
2. Cancel contextmenu explicitly where it is inappropriate; canceling pointerdown or setting touch-action is not a substitute.
3. Keep touch-action:none on the drawing gesture surface, not the whole application. Do not globally cancel touchstart to hide a browser menu.
4. Make native-editing exceptions structural and reusable, rather than copying per-button handlers and eventually missing a new control.
5. Use explicit image Save/Share actions if browser image menus are suppressed.
6. Test both visible pixels and authoritative saved drawing state. Include a valid tip as a negative control so an app that rejects all pen input cannot pass.
7. Preserve a first-failure record and distinguish DOM event dispatch, CDP injection, and physical stylus evidence. They answer different questions.
8. Keep the stable checkpoint and saved user data separate from changes to input behavior. A PWA does not need a native rewrite merely because an application-surface browser default was left enabled.

Reusable implementation: `web/src/lib/native-interactions.ts`. Ink state handling: `web/src/components/incant/SketchCanvas.tsx`. Regression tests: `web/tests/native-interactions.e2e.ts`, plus existing pixel-eraser, palm, voice, undo/redo/reload and onboarding suites.

## Physical follow-up

On the DC-1, distinguish pure hover (no touching/buttons), any available side-button action, normal tip, inverted eraser, resting palm, and long presses on the generated image and frame. Record which menu appears (image actions versus text selection), target, pen orientation/button state, and Chrome/build versions. Check text-field selection and scrolling too. A trace should contain only event type, pointer type, button/buttons, pressure, cancelability and whether it was prevented—no spell text or image content. Do not record unrelated app input or expose unrelated Chrome tabs to collect it.

## Primary references

The [W3C Pointer Events specification](https://www.w3.org/TR/pointerevents3/) defines the button bitmasks and chorded-button behavior. [Pointer Events level 2](https://www.w3.org/TR/pointerevents2/) explicitly covers a hovering pen transitioning from no buttons to a pressed button and notes that preventing pointer events does not generally prevent contextmenu. These are browser contracts, not evidence of the DC-1's exact physical mapping.

## Wand press feedback

The wand now responds immediately through `:active` and the connecting phase: it tilts back and emits a dashed ripple. Only after microphone/session setup succeeds does it show the listening star, two expanding rings, and “Listening · speak your spell.” Tap-to-listen keeps its separate “tap to cast” cue. Reduced-motion mode uses a stationary ring and sigil. Feedback disappears when the voice flow returns to idle; no permanent controls were added.

Two new browser tests delay microphone permission deliberately, assert the connecting/listening distinction, release a held press, and check normal/reduced-motion rendering. The first reduced-motion test released in under 300 ms and correctly entered tap-to-listen; the fixture now holds for 350 ms to exercise the intended hold branch. This was a test timing correction, not a product change.

Final combined QA: production build PASS, 9 unit tests PASS, 51 browser tests PASS. Evidence: `docs/evidence/qa-native-input-and-wand-final/`. Screenshots use only a synthetic roof sketch. Physical pen proximity and the perceived animation on the DC-1 remain unverified because the device is disconnected.

Railway deployment `3b608094-4a0b-49ff-bbca-9c4a5f878d14` succeeded. An isolated browser verified the hosted canvas context-menu guard and immediate wand press feedback. Provider endpoints and backup writes were blocked by test routes; no paid calls or production archive writes occurred. Receipt: `docs/evidence/native-input-hosted.json`.
