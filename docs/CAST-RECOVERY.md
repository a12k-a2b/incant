# Casting feedback and sketch comparison — 2026-09-11

The owner reported a spell impact followed by no fog or result on deployment 3b608094-4a0b-49ff-bbca-9c4a5f878d14. The DC-1 was disconnected during investigation. Railway logs contained startup output, not request-level outcomes, so the exact failed cast cannot be reconstructed.

Two observable UI defects explain why a failure could appear silent:

- Immersive mode clipped all `.room-message` elements to one pixel, including errors and recovery notices.
- The flight/impact ran during transcript finalization, before any image request, while fog began only at image generation.

The room now displays temporary, dismissible parchment messages. Fog begins during finalization and remains through generation; the flight begins only when entering the cast phase. Drawing and spell text remain available after an error. This does not claim to fix an unobserved provider or microphone failure.

Live service check through the authenticated Railway service used synthetic speech and a synthetic cottage, without archive writes: voice transcribed 61 characters, image generation returned HTTP 200 in 11.7 seconds. The first image fixture was below the existing minimum area and was rejected by local validation; the corrected 1024×1536 fixture succeeded. No key values or real user artwork are included in evidence.

The owner also requested replacing the bright dog-ear comparison control. A muted, ink-drawn scrap with a stick figure now sits beside the frame's scrolls. The control is rendered outside the image clipping region; the original sketch overlay stays aligned with the image. Tap toggles comparison, and existing drag/keyboard interactions remain available. Portrait and landscape previews were inspected. The onboarding hint now refers to the scrap.

Regression tests cover visible/dismissible cast failure, preserving draft and words, successful reveal and saved-spell recovery after reload, and fog without premature impact during voice finalization. The initial save test incorrectly expected a reload to automatically reopen the last image; it now checks the existing saved-spells flow instead.

Evidence: `docs/evidence/cast-service-check.json`, `sketch-token-portrait.png`, `sketch-token-landscape.png`, and `qa-cast-recovery/`. Physical DC-1 microphone and display confirmation remains BLOCKED until available or owner retest.

The final affected QA profile passed: production build, 9 unit tests, and 53 browser tests. Deployment: `7a448b3f-0fe1-4390-81db-de2128790cf6` (Railway SUCCESS).

Hosted verification passed in isolated Chromium at DC-1 portrait and landscape dimensions: result display, scrap comparison toggling, readable cast error, and dismissal. Hosted preview routes reused the synthetic generated image and mocked failure responses, with cloud writes disabled; these UI checks were separate from the earlier real provider check.
