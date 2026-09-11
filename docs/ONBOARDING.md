# A little guide to Incant

Four manually advanced animated parchment cards introduce drawing, voice casting (hold/release and tap/tap), typed casting, and the moon/books. The last card also explains the source-comparison corner. No timers advance the lesson; Skip is always available, Escape dismisses, Back revisits a page, and the final action completes it.

The introduction opens after the room is unlocked when localStorage `incant-introduction-v1` is not `seen`. Skip and completion both persist dismissal on this browser. A small question mark in the far bottom-left frame margin replays it; the mark's 44px touch target stays outside the drawing and below the dragon. The existing desk Help action also opens the same guide. If browser storage is unavailable, dismissal still works for the current visit but cannot persist across reload.

Illustrations use lightweight SVG/CSS animations in parchment and ink colors, plus the existing typewriter artwork. Reduced-motion disables animations. A native modal dialog keeps keyboard focus inside and restores focus when dismissed. The tour never requests microphone access, casts an image, or edits the drawing. No provider prompt or data model changed.

Evidence: dedicated browser checks cover first visit, skip/reload, replay, Escape/focus, Back/completion, preserving an existing drawing, and portrait/landscape/phone/short-viewport layouts. Screenshots use empty or synthetic sketches. Physical DC-1 verification is separate from browser viewport checks.

The initial full regression run caught the corner help target overlapping the legacy desk latch. The run was stopped after retaining the first failures (qa-onboarding). The standalone corner mark is now rendered only in immersive mode; legacy desk users use its existing Help button. The subsequent clean run is the release evidence, not the interrupted run.

Release: Railway deployment 5f8b29f8-559c-4fcf-ac0e-20b53ac6f923. The clean QA run passed the production build, 9 unit/contract tests and 44 browser tests. Dedicated viewport evidence covers DC-1 portrait/landscape and small screens. The connected tablet was being used in another app, so it was not navigated or refreshed for this release; physical onboarding interaction remains a user check.

Live isolated-browser verification through anjan.app/incant passed first visit, all four pages, completion across reload, help replay, and Skip, with zero cast/token requests. See docs/evidence/onboarding-hosted.json and introduction-hosted screenshots. The original stable Git checkpoint remains unchanged.
