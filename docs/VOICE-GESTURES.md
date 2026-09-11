# Voice control: tap or hold

The wand starts microphone setup on pointer-down. Releasing within 300 ms latches hands-free mode; tapping again ends the turn and casts. A longer press retains hold-to-talk behavior and casts on release once listening is ready. Releasing a hold during setup cancels; a second tap during hands-free setup cancels. The label distinguishes connecting, hold listening, hands-free listening, and finishing. Keyboard Space/Enter retain hold/release behavior; Escape cancels. The existing one-minute recording limit remains.

Chrome long-press selection is prevented on the wand with non-passive native touchstart cancellation, contextmenu and selectstart cancellation, touch-action:none, and nonselectable contents. Other buttons also have nonselectable labels. The spell textarea retains normal editing/selection. Pointer capture tracks one initiating pointer; an unrelated pointer release cannot finish the recording. Unexpected cancellation or capture loss stops the session. Hands-free recording can retain focus elsewhere in the app; backgrounding still stops it.

Validation: qa-voice-gestures/report.md records build, six unit contracts, and nineteen browser flows passing. Mock-provider browser coverage includes a sustained native Chromium touch sequence, explicit contextmenu cancellation, unrelated touch release, tap-start/tap-finish, keyboard hold, and release before microphone permission resolves. Five focused browser cases passed again after final button-selection protection and help/Escape edits. Hosted delivery checks are in evidence/voice-deployment.json. Desktop emulation is not physical Android confirmation; the owner must retry on the updated page.

The owner screenshots showed Chrome's text-selection action menu and selection extending to the disabled Cast spell button. They were inspected from temporary local copies; their real sketch has not been added to repository fixtures.

The immersive room subsequently replaced the visible wand labels with illustration and a small active-session status; accessible names and both gestures remain. See IMMERSIVE-ROOM.md for the typewriter alternative and current layout.
