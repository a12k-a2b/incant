# Wand and password-free entry — 2026-09-22

Wand: 20% larger SVG/control footprint, faint blue outline and small electricity marks. Tap threshold 450 ms (previously 300), measured from input event timestamps. Hold/release and second tap fire the existing flight immediately, before transcription finishes; one promise keeps late transcription from replaying the strike. The wand stays raised through launch and lowers afterward. Fog follows the 900 ms strike; results wait for that strike. Reduced-motion settings remain respected.

Public entry: /api/session issues an automatic HttpOnly browser capability; no typed password needed for drawing, casting, voice, or native owl sharing. Existing signed legacy room sessions retain and renew archive access. New browser archives and private owl controls are isolated. All new sketches still back up to Railway under browser-specific directories; existing archive data is unchanged. Anonymous visitors cannot enumerate or revoke another browser's owl messages. Existing explicit owl reply-link capabilities remain shareable.

The owner subsequently requested one shared friends spellbook. Approval review blocked changing the archive to anonymous public read/write because the deployment URL is public and friend-only sharing does not establish permission for unrestricted public browsing. Shared-gallery rollout is pending an explicit access decision. No attempt was made to bypass that rejection. Browser-specific cloud saving remains enabled meanwhile.

Validation: first whole-suite run had four failures (two flight-container lifetime expectations, one test drawing before hydration, one intended 360 ms test press stretched past the boundary by transport scheduling). Container now survives finishing/casting while its animation starts once; tests await drawable readiness; the deliberate-tap boundary uses explicit native-event timestamps, with separate real Chromium quick-tap/hold checks. A repeat-use semantic test failed once in the earlier focused batch then passed three isolated repetitions; final full suite remains the release gate. Retain failed QA evidence separately.

Physical DC-1 tap comfort and grayscale glow legibility remain manual checks. Synthetic browser images do not certify physical stylus/microphone behavior.

The first combined public-entry run passed build and 15 server/unit tests; 87 browser cases passed and 10 failed because the newly added readiness helper incorrectly required the immersive-only Dragon settings button in legacy desk mode. Corrected the test helper to accept the corresponding desk-tools button. Both are disabled while canvas hydration is in progress. This was a harness defect, not evidence of ten product regressions. The replacement complete profile is qa-wand-public-entry-verified.

Landscape wand overrides were also enlarged by 20% (240→288 px width and 115→138 px height cap), matching the portrait change. Hosted verification uses a fresh browser with cloud writes intercepted, no existing artwork, and no image-generation call.

Final repository profile: PASS — production build, 15 unit/server tests, 97 browser tests. Physical DC-1 interaction remains a manual check.

Deployment f17495ca-6dd3-4692-a8eb-0a177d91cd9a succeeded for revision 7492641. Hosted check PASS: automatic entry, enlarged wand, glow, synthetic ink endpoint, durable local revision, reload pixel preservation, and exact application-JavaScript match. Separate fresh-browser cloud status confirmed backup configured, empty isolated archive, and image/voice configuration present (no live generation/transcription invoked). Rollback tag: incant-before-wand-public-2026-09-22.
