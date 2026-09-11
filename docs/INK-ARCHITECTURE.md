# Incant ink: reuse the lessons, measure before importing the engine

Decision: PWA first. Keep the native Android export as a prototype, not a verified release. No rewrite or full note-overlay import in this change.

Inspected note-overlay-demo revision d6a520552b0a44fd622f3b4a542d68cf63ae77ba: InkInputs.kt, StrokeStartTool.kt, JetInk.kt, EglInk.kt, JetDry.kt, and WetHandoff.kt. JetInk/EglInk/JetDry alone span 4,669 lines. Their host integration includes AndroidX stroke models, prediction, live-stroke rendering, saved-stroke adoption, and recovery/watchdog behavior. Their comments describe historical DC-1 measurements; none are new Incant measurements.

Reusable now: consume coalesced samples in order; fix pen/eraser choice at stroke start; use a single canonical stroke representation; preserve shape through view resize; keep pen input separate from fingers; avoid retaining a full-screen bitmap per undo step. Incant's PWA implements these concepts using Pointer Events and a fixed 1024×1536 canvas, matching the image request. It persists normalized vector samples and renders/export from the same canvas. No Kotlin source is imported into the browser.

Potential next extraction: an Activity-hosted Android ink surface exposing begin/add/end/cancel, undo/redo, draft serialization, and export. Reuse AndroidX brush/input decisions and the proven live-to-saved-stroke handoff. Do not import notebook indexing, sync, overlays, accessibility services, multi-book stores, CPU boost machinery, or raw notes. Expose one PNG + normalized stroke snapshot to the same Railway backend.

Decision gate before native investment: on the same DC-1 and software fingerprint, compare PWA versus note-overlay for visible pen lag, fast curves/corners, pressure, palm rest, eraser, pen-up shape stability, rotation/keyboard resize, and suspend/resume. Use repeated traces/video and the owner's feel. A native rewrite is justified by a meaningful pen or reliability deficit, not by the word “native.” That measurement is currently BLOCKED: no Incant device evidence captured.

## What native would and would not change

Native Android can use platform low-latency rendering and richer stylus integration; this is the plausible user-visible reason to invest. It does not make the remote image model faster or more composition-faithful, and does not remove the need for Railway to protect shared provider keys. A plain WebView wrapper would not itself deliver the native ink advantage.

The PWA supports installable standalone presentation, a cached offline drawing surface, and browser-based access on other devices. Generation and live transcription require connectivity. Browser storage is local to that installation and can be cleared; saved images should be exported for durable ownership. No cross-device collection sync is implemented.

If measurement warrants it, implement a small Android drawing client with a native ink surface and the same server API before considering a full application rewrite. Keep the web client for laptops and other tablets.

Sources checked 2026-09-10: [Android low-latency stylus example](https://developer.android.com/codelabs/large-screens/advanced-stylus-support?hl=en), [PWA installation](https://web.dev/learn/pwa/installation?hl=en).
