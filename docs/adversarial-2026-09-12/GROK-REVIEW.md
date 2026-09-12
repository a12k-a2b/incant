# Independent adversarial review (source-only)

This is **not** a release approval. No tests were run. Findings are limited to the frozen files. Hardware-only guesses (mic quality, palm-rejection firmware, whether a given Android `canShare` matrix fails) are labeled as such and are not counted as confirmed bugs.

**Archetypes vs intent**

| Archetype | What the source actually does | Risk |
|---|---|---|
| First-time user | Empty parchment, `?` onboarding, typewriter, hold/tap wand | Typed spells are wiped when dictation starts; connecting wand copy lies |
| Impatient voice user | Hold/release **or** tap/tap is implemented on one pointer state machine | Second tap while connecting queues a cast, not a cancel |
| Stylus/palm user | Desk `selectstart`/`contextmenu` suppressed; wand `touchstart` is non-passive + `setPointerCapture` | No `SketchCanvas` in packet, so palm-on-paper is unreviewed. Wand maps `pointercancel` / `lostpointercapture` to **cancel**, not release-to-cast (event policy is source-proved; whether a stylus/OS fires those events is hardware) |
| Archive keeper | IDB pairs + optional folder/ZIP; gallery is a separate store | Fourfold casts can drop generations in the pair store |
| Image sender | Owl post → `navigator.share` with image + sketch files when allowed | Combined `canShare` failure silently shares a URL without local files |

---

## 1. Hands-free “tap to cancel” while connecting actually queues a cast

**Where:** `IncantApp` wand `aria-label`, `onPointerUp`, `endVoice`, `beginVoice` (`src/components/incant/IncantApp.tsx`)

**Kind:** Source-proved logic / labeling bug (not hardware).

**Causal steps**

1. Default UI is immersive (`mode !== "desk"`).
2. User has a non-empty sketch. First tap: `onPointerDown` calls `beginVoice()`; `phase` becomes `"connecting"`.
3. `onPointerUp` within 300ms with `voice.current` set takes the hands-free branch (`setHandsFree(true)`), so this is tap/tap, not hold/release.
4. Label becomes **“Connecting… tap to cancel”** (`phase === "connecting" && handsFree`).
5. Second tap: `onPointerDown` sets `voicePress.stopping = handsFreeRef.current` (**true**) and does **not** call `beginVoice`.
6. `onPointerUp` hits the `else` branch: `endVoice()` with `cancelled === false`.
7. `endVoice`: `!s.ready` → sets `s.stopRequested = true` and the notice “Gathering your voice while the wand connects…”. It does **not** close the session.
8. When `beginVoice` finishes connecting, both the Gemini and conversation paths do `if (s.stopRequested) void endVoice();` — the **cast/finish** path.
9. Gemini: `endTurn()` then `cast(final)` or “The wand heard no words…”. Conversation: `RealtimeVoice.finish()` (forced `cast_spell` tool_choice). That is not cancel.

The control that actually cancels is `cancel()` via “Stop waiting”, not the wand. Dead code in `endVoice` (`if (cancelled) { … if (!cancelled) setNotice(…) }`) never teaches “hold until Listening”.

**Severity:** High — impatient and first-time voice users, core hold/tap contract.

**Smallest fix:** If `voicePress.current.stopping && !s.ready` (hands-free second tap still connecting), call `endVoice(true)`. Keep hold-release-during-connect as `stopRequested` so “keep holding” still means “cast when ready”. Align the label with the branch.

**Oracle:** Sketch present → tap wand → tap again before “Listening”. Expect `phase === "idle"`, `voice.current === null`, `voiceSketch.current === null`, no `cast()` / `finish()`. Notice may explain cancel. Contrast: hold through connect, then release ≥300ms, should still `stopRequested` → end/cast when ready.

---

## 2. Dictation start erases a typed incantation before any words arrive

**Where:** `beginVoice` Gemini/live path, `setWords("")` just before `setPhase("listening")`; `words` effect writes `incant-spell-v2` (`IncantApp.tsx`)

**Kind:** Source-proved logic. Conversation mode does not do this; do not assume a default `voiceMode`.

**Causal steps**

1. User types a spell (typewriter or spellbook `textarea`). `words` is persisted on every change.
2. User holds or taps the wand. `beginVoice` starts. Typed text is still in state during `"connecting"`.
3. Live-transcribe connect succeeds: **`setWords("")`**, then `"listening"`.
4. localStorage now stores `""`.
5. If they cancel (`endVoice(true)`, blur while not hands-free, visibility change, Escape) or get an empty transcript, the typed spell is gone. Canvas is unchanged; they must retype.

**Severity:** High — first-time users who write first, then try the wand; impatient users who abort a slow connect.

**Smallest fix:** Do not clear `words` until a non-empty transcript exists. On cancel / empty `endTurn()`, restore the pre-listen snapshot.

**Oracle:** Set `words` to a unique string, start dictation (`voiceMode !== "conversation"`), cancel after `"listening"` (or empty `endTurn()`). `words` and `incant-spell-v2` must still equal that string. A real transcript may replace it.

---

## 3. Fourfold `archiveImage` read-modify-write can drop generations

**Where:** `archiveImage` in `src/lib/archive.ts`; `cast()` `Promise.allSettled` over `settings.fourfold ? 4 : 1` in `IncantApp.tsx`

**Kind:** Source-proved race. Whether fourfold is on by default is **not** in this packet; the defect is the concurrent path.

**Causal steps**

1. `cast()` awaits one `archiveSketch(png, text, true)` and reuses `pair.id`.
2. For `count > 1`, each settled job independently `await archiveImage(pair.id!, { id, image, spell })`.
3. `archiveImage` is get → mutate `pair.images` → `put` in separate `readwrite` transactions. No queue (unlike `syncArchive`’s `fileQueue`).
4. Two transactions can `get` the same pair before either `put`. Last `put` wins; the other image id never lands on the pair.
5. `saveCreation(item)` and in-memory `setCreations` can still succeed, so the spellbook gallery and the independent pair archive diverge. ZIP/folder export uses `allPairs()` / `pairFiles()`, so the lost generation is missing from the archive keeper’s copy.

**Severity:** High for archive keepers when fourfold is enabled (silent pair-store loss). Gallery may still show the image.

**Smallest fix:** Serialize `archiveImage` per `pairId` (chain like `fileQueue`), or append all images in one transaction after the casts.

**Oracle:** Seal a pair, then overlapping `archiveImage(id, {id:"A",…})` and `archiveImage(id, {id:"B",…})`. `allPairs()` for that id must contain both image ids. Repeat under `fourfold` with both `requestCast` calls resolving.

---

## 4. Viewing a saved generation is not a first-class sketch source; voice teardown leaves an empty desk

**Where:** `empty` render flag; typewriter / Cast `disabled={… empty …}`; `beginVoice` (`setActive(null)`, `voiceSketch`); `endVoice(true)` / `cancel` (`voiceSketch.current = null`) (`IncantApp.tsx`)

**Kind:** Source-proved logic. No canvas reload API is used in this file.

**Causal steps**

1. `newPage()` clears the canvas (`empty === true`) and `setActive(null)`.
2. Library `onOpen` sets `active` and `last` from the creation. It does **not** put `c.sketch` back on `SketchCanvas`.
3. Cast spell and typewriter submit stay **disabled** because they key off canvas `empty`, even though `cast()` itself would accept `active?.sketch`.
4. `beginVoice` **does** accept `active?.sketch`, then immediately `setActive(null)` and stashes `voiceSketch`. The manifestation disappears.
5. Cancel (`endVoice(true)`, blur, `pointercancel` / `lostpointercapture`, tab hide) clears `voiceSketch` and does not restore `active`.
6. User sees empty parchment. The pair still exists in the spellbook, but the desk no longer shows the opened work. “Back to sketch” is also gone because `active` is null.

**Severity:** High for archive keepers reopening work after turning the moon; first-time users who think the drawing vanished. Stylus `pointercancel` on the wand is one source-proved entry to step 5; **whether** a given palm/stylus stack fires it is hardware.

**Smallest fix:** Treat `!!active?.sketch` like a non-empty canvas for Cast/typewriter. In `beginVoice`, keep `active` until a cast actually starts, or restore the previous `active` whenever voice ends without calling `cast()`.

**Oracle:** `newPage` until canvas `isEmpty()`, open a creation with `sketch` and `image`. Typewriter/Cast must be enabled if `words` is non-empty. Start then cancel voice: `active` returns to that creation, manifestation visible, canvas still empty (or sketch explicitly loaded — pick one and test it).

---

## 5. Android share sheet can send a link and drop the local image + original sketch

**Where:** `OwlMail.share` (`src/components/incant/OwlMail.tsx`)

**Kind:** Source-proved fallback. **Whether** `navigator.canShare({ title, text, url, files })` is false on a given Android build is a platform hypothesis; the code’s behavior when it is false is not.

**Causal steps**

1. Product intent: share locally via the Android share sheet, including source drawing and generation (`Image · original sketch · your spell`).
2. `share()` always builds `ShareData` with `title`, `text`, and `url` (`/#owl=` + token).
3. Files (generation PNG, optional `incant-original-sketch.png`) are attached **only if** `navigator.canShare?.({ ...data, files })` is true.
4. If `canShare` is missing or returns false for that combo, `navigator.share(data)` runs **without** `files`. Direct mode (`show()` → `share(cached)` when `navigator.share` exists) never even opens the dialog first.
5. Success notice: “Handed to your sharing app…” — same copy as a true file handoff. User can complete a share that is only a 30-day owl URL.

**Severity:** High against the stated image-sender intent (local sheet with sketch + generation). Medium if remote owl links are an accepted substitute (not what the intent says).

**Smallest fix:** Prefer `canShare({ files })` / `share({ files, title, text })`. If that fails, fall back to URL. Do not drop files solely because the combined URL+files payload is illegal. In direct mode, if files were omitted, open the dialog so Copy link vs file share is explicit.

**Oracle:** Stub `canShare` false for `{url, files}` and true for `{files}` only. `navigator.share` must be invoked with both PNGs when `active.image` and `active.sketch` exist. Stub both false: share URL, UI must not claim a local image handoff.

---

**Out of packet:** `SketchCanvas` palm/stroke handling, `loadSettings` defaults (`fourfold`, `voiceMode`, `owlMode`), and collection/cloud backup internals were not in the freeze and are not treated as reviewed.
