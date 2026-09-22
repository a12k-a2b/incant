# Guided first entry and actual-object highlights

The legacy `?view=spellbook` parameter initialized the tools drawer as open. That made saved links open the old editor panel instead of the immersive desk. It now requests onboarding and is consumed with history.replaceState so Skip/completion stays dismissed after reload. Normal first visits retain the guide, returning visits retain dismissal, and the question mark replays it. Opening How to cast from the tools drawer closes that drawer first.

The modal now owns a transparent viewport, with a centered parchment card and SVG shade mask. Each step measures actual controls: parchment, wand, typewriter, then moon/books/owl/dragon. The mask leaves those objects undimmed and adds a warm glowing outline. ResizeObserver and viewport resize keep outlines aligned. Underlying controls remain inert while the guide is modal; no microphone or generation is started by the tour. Reduced-motion retains static highlights.

Focused validation: seven onboarding cases pass, including legacy URL with a previously dismissed guide, exact control/outline alignment, dismissal persistence, Back/Next, keyboard escape/focus return, unchanged drawing pixels, and DC-1 portrait/landscape plus phone/short layouts. Keeper inspected synthetic DC-1 typewriter and short-screen screenshots. A first test attempt reached another project on port 5173; it was stopped as an infrastructure failure. INCANT_TEST_URL now allows an isolated test port; this run uses 5187. Physical DC-1 glow readability remains a manual check.

First complete profile: build and 15 unit tests PASS; 97/98 browser tests passed. Legacy keyboard hold test used 350ms, inside the existing 450ms tap window, and correctly entered hands-free mode rather than sending. Corrected that test to a 550ms hold; no product wand timing changed.

Final profile PASS: production build, 15 unit/server tests, 98 browser tests. Evidence: docs/evidence/qa-onboarding-spotlight-verified.

Railway deployment 20a3ade3-b653-4d16-90fe-968a2c6a179c succeeded for revision 49f7c94. Hosted verification PASS: old link opens guide rather than tools, actual wand/typewriter/moon highlights exist, dismissal survives reload, and deployed JavaScript matches the tested local build. No private artwork or provider calls used.
