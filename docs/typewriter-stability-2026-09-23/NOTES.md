# Typewriter keyboard stability

User video IMG_9869.MOV (7.64 seconds) inspected locally as a 3fps contact sheet. It shows the bubble opening low, keyboard covering it, then upward/settling movement; keyboard dismissal drops the still-open bubble. Original personal video/frames are not committed.

Two GPT-6 Luna subagents split scoped product implementation and regression tests. Keeper reviewed both and requested preservation of single-focus behavior plus overflow support for short keyboard viewports. Final change: fixed safe-area top anchoring; visualViewport affects maximum available height only, never bottom placement; removed bottom transition, dynamic textarea height, and keyboard-height media breakpoint. Native modal autofocus set/remove lifecycle and draft/canvas height locking remain unchanged. Small viewports scroll within the bubble.

Focused Chromium tests: five passed. New regression exercises 500/420/360/200px viewport heights, stable top edge and visible bottom, reachable cast button, exact canvas dimensions/pixels after restoration, reopen focus and subsequent wand connecting. Existing tests cover one focus event, retained text, one typed cast and Escape. Keeper inspected synthetic phone screenshot. Full profile is qa-typewriter-stability-20260923. Browser viewport simulation is not a physical Android IME recording; actual keyboard animation smoothness remains a user/device confirmation.

Full profile PASS: production build, 15 server/unit tests, 99 browser tests. No physical keyboard animation certification.
