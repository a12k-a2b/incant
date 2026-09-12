# Incant adversarial review — verified outcome

The reviewed fixes are live at https://anjan.app/incant (Railway deployment `1af6cfbc-0c42-457c-af18-6f5f77f38886`, product commit `7c5db81e196dd20d2d698c1441359fadfff479b2`). The illustrated frame, opacity and canvas layout are unchanged.

Fable (`claude-fable-5-1`, Claude Code Max) and Grok (`grok-4.6-build`, existing subscription route) independently reviewed a frozen source snapshot. The brief covered first-time users, stylus/palm-heavy sketchers, storytellers, impatient users on weak Wi-Fi, archive keepers/party hosts, senders/recipients, and immersion/accessibility. Three `gpt-5.6-sol` agents implemented input/voice, archive/durability, and sharing fixes; the keeper reproduced, integrated and tested findings. Fable ran executable checks; Grok's completed report was source-only. Earlier incomplete runs are disclosed in reviewer receipts.

## What changed

- Editable drafts now use durable, revisioned storage with fallback recovery. Storage failure cannot silently clear the visible drawing. Recasting an old sketch preserves unrelated unfinished work and associates each generation with its correct source.
- Pen contact guards frame controls against simultaneous touches. Blur, cancellation and delayed voice events release ownership correctly. Wand keyboard/semantic activation, early release, tap/tap and cancellation have regression coverage; typed words survive empty voice attempts.
- Local image sharing no longer waits for an optional cloud reply link. The owl hands off the result, original sketch and actual spell; duplicate sharing is guarded and attachment extensions match their bytes.
- Dragon settings contain Undo ink, Redo ink, Save sketch and contextual return-to-drawing controls. Sketch-only archive entries are accessible. The moon's hit region no longer reaches the tested blank parchment area.
- Cloud restore preserves recovered generations and avoids repeatedly hashing unchanged image binaries. Large-library pagination and performance measurement remain a documented loose end.

One alleged concurrent IndexedDB overwrite was rejected after source inspection and a four-write regression proved the existing transaction serialized correctly. See [TRIAGE.md](TRIAGE.md) for individual dispositions and retained failed gates.

## Evidence and limits

| Claim | Outcome | Evidence |
| --- | --- | --- |
| Production build and unit/server contracts | PASS | 14 tests; `../evidence/qa-adversarial-verified/` |
| Browser regression profile | PASS | 90 scenarios, no skips or flaky cases; same QA folder |
| Real hosted image cast | PASS | `hosted-check.json`; one synthetic cottage cast, 12,516 ms |
| Strike, fog, reveal ordering | PASS | Strike preceded fog by about 905 ms; reveal lasted about 2.7 seconds |
| Local share attachment payload | PASS, mocked handoff | Two exact image files plus prompt; no external message sent |
| Deployed application JavaScript | PASS | Byte-for-byte equal to tested JS; `hosted-artifact-check.json` |
| Whole build-folder hash equality | FAIL, explained | Docker omits test sources; local Tailwind build has four extra generic CSS rules. Removing exactly those rules yields identical CSS. Asset filenames, HTML and service-worker references consequently differ |
| Installed DC-1 launch and settings visibility | PASS | Existing signed APK inspected; full-screen app and new dragon controls observed |
| Physical stylus/palm, real speech, native share sheet | BLOCKED/manual | Not exercised by synthetic browser tests or an ADB tap |
| Complete device release certification/performance budgets | BLOCKED | No repeated benchmark, full lifecycle or crash/ANR certification performed |

The hosted synthetic fixture was isolated from the owner's cloud archive; no test letters or recipient messages were sent. Its sketch and result screenshots are included here. One successful cast supports a smoke-test claim, not universal composition fidelity.

The DC-1 fingerprint was `Daylight/vext_jagar/jagar:13/TP1A.220624.014/2609012347:user/release-keys`. Existing `app.incant.web` version 1.0 APK SHA-256: `59d9f5840db0aeb91ec0fbeaa1db62e364c23dd0f65914b7815bc70b5b0624b0`. Its verified certificate matches hosted Digital Asset Links. The unchanged wrapper opened warm in one observed 546 ms sample. Existing artwork remained visible; settings were closed without edits and the tablet returned to its original sleeping state. Device screenshots remain local temporary evidence and are excluded from Git/reviewer packets.

## Recovery

The pre-review source is preserved and pushed as `incant-before-adversarial-2026-09-12` at `46a4faa`. The older owner-approved stable checkpoint remains unchanged. Previous Railway deployment: `ead41fce-af53-4e85-bbb3-c4850bf3a902`. No destructive backup migration or app-data reset was performed.

Next hands-on check: hold/speak/release, tap/speak/tap, cancel and retry, then draw with normal palm contact. The app is ready on the DC-1 when it wakes.
