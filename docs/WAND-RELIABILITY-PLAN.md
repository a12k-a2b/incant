# Reliability and immersive controls — 2026-09-12

Release failure conditions: a shown image consumes the next wand gesture; tap mode stops on unrelated blur; duplicate release/late network responses produce a second cast; fog precedes impact; fast generation skips the strike; cancellation reveals stale results; microphone or conversational playback survives cancellation/background; sharing pairs the wrong sketch/prompt with an image; existing archive data is modified by redesign. Provider access/hardware audio remain BLOCKED unless exercised, never inferred from mocked tests.

Keep dictation default. Add opt-in OpenAI Realtime conversation and owl direct-share/tray choice in dragon settings. Remove owl envelope. Share final image + original sketch + spell, with terse humorous text. Existing letters remain readable. Storm/lava-cloud casting animation is a loose end; retain hourglass for now.

## Implementation and evidence — 2026-09-12

- Removed the result-only first-press branch: one wand gesture now begins voice using that result's original sketch. Tap/hold intent uses a synchronous ref so blur cannot read stale hands-free state.
- Microphone PCM is buffered during Gemini setup (bounded at 15 seconds), including a release requested before setup finishes. Finalization waits for the transcript rather than running effects speculatively. It can finish promptly after final words, or wait up to eight seconds for late words.
- The visual strike has a 900 ms minimum before fog/reveal; network work runs concurrently. Operation serial checks still fence cancelled and stale results.
- Painted dragon opens parchment settings, with dictation as default and optional OpenAI Realtime `gpt-realtime-2.1`. Server-held credentials mint ephemeral browser WebRTC credentials. Sessions close tracks on completion, cancellation and backgrounding, and are bounded at three minutes.
- Painted owl defaults to native sharing once its parcel is prepared, with an optional post tray. Both generated and source images plus the spell travel together. Private recipient links preserve explicit open receipts and image replies; Android sharing does not prove message delivery.
- Menus and archive use self-hosted OFL IM Fell English, vellum colors and wax seals. Font is in the offline service-worker cache. Existing archival and frame composition rules remain.
- Future moving storm clouds are recorded in Loose Ends; hourglass remains.

### Results

PASS: production build, 12 contract tests, 60 isolated browser tests via `qa-wand-sequence-final/report.md`. Tests include first-gesture recasting (tap and hold), delayed setup, cancellation, original pairing, direct share user activation, receipt isolation/revocation, persistent dragon settings, responsive layouts and input regressions.

First full run FAIL: the dragon hotspot intercepted the old desk latch, exhausting the browser check timeout. Fixed by excluding the dragon from legacy desk mode; the full rerun passes. Evidence retained in `qa-wand-sequence/`.

PASS: live OpenAI WebRTC with synthetic sketch and synthesized speech: transcript, spoken response, cast function and stopped microphone tracks (`realtime-live-audio.json`). A separate text-driven live check is in `realtime-live.json`.

PASS: live Gemini buffered synthetic audio flushed after connection produced the complete expected cottage spell; observed finishing time 1703 ms in this single sample (`gemini-buffer-live.json`). This is functional evidence, not a latency benchmark.

BLOCKED: physical DC-1 touch/hold, palm rejection, microphone/speaker and perceived motion; `adb devices -l` returned no connected devices. No APK or device data was changed. Native share-sheet delivery to an external person was not performed.

### Limits to revisit

The direct owl route falls back to its tray while a parcel is still preparing or if native sharing is unavailable. Owl post retains its existing 30 new letters/day and 1000-letter storage caps. A chosen Android target decides how share title/text/files map into its own composer. Open receipts require the private letter link to be deliberately opened; viewing a raw attachment in email does not send a receipt.

PASS: Railway deployment `ead41fce-af53-4e85-bbb3-c4850bf3a902` reached SUCCESS. Hosted checks confirmed the new client/font, unauthenticated Realtime rejection (401), authenticated ephemeral token issuance (200), and complete source/image/spell parcel with explicit receipt, private reply persistence and revocation. See `wand-hosted.json` and `owl-parcel-hosted.json`. One clearly synthetic closed test letter remains in the post tray; no external messages were sent.
