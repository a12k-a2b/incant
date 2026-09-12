# Web inking: Incant's reusable design

This describes the inking system after the September 12, 2026 hardening pass. It is a small finite-page Canvas 2D implementation, not an infinite-whiteboard SDK. Keep its acquisition, rendering and storage responsibilities separate when reusing it.

## What happens to a mark

1. Pen/mouse contact captures the pointer. Finger input does not draw. A separate room interaction guard prevents simultaneous palm touches from activating frame controls.
2. Each native event's coalesced samples become normalized `{x, y, p}` points. The current stroke lives in memory and each segment is painted immediately. Neither React reconciliation nor a network response is required to show ink.
3. On lift, the final position is included using the last contact pressure. The stroke joins the undo history. Rounded copies of already committed strokes are cached; only a new stroke needs rounding.
4. The complete editable draft is committed to IndexedDB on this device. A revision and drawing are updated in the same transaction. Saving uses a small revision key, rather than reading the old drawing every time.
5. A compatibility localStorage copy follows. It serializes the drawing once. If another stroke is active, this optional copy waits and intermediate copies are superseded. If IndexedDB fails, the fallback is required and runs immediately; if both stores fail, the user is told and destructive page clearing refuses to proceed.
6. An archive PNG is generated after a pause, only when no stroke is active. Cloud backup operates on archived sketch/image records independently. Railway is not in the pen-to-screen path.

“Drawn,” “saved locally,” and “backed up to cloud” are different states. A live stroke is in memory until commit. Blur, page hiding, capture loss and cancellation commit what has arrived, but a sudden process kill/power loss can still lose an unfinished stroke or an uncompleted write. This design does not promise per-sample crash durability. Nor does saving asynchronously mean all encoding/cloning runs off the main thread.

## Reuse map

| Responsibility | Source | Reuse contract |
| --- | --- | --- |
| Points, strokes, validation | `web/src/lib/drawing.ts` | Normalized coordinates, pressure, eraser flag; keep versioned persisted formats compatible |
| Event batch and coordinate conversion | `web/src/lib/ink-input.ts` | Read coalesced events once; supply one bounding rectangle per batch; no DOM reads inside point conversion |
| Foreground activity gate | `web/src/lib/ink-activity.ts` | Each surface supplies a unique owner object; release on every terminal/lifecycle path; defer optional work only |
| Canvas renderer and history | `web/src/components/incant/SketchCanvas.tsx` | Imperative pixels, refs for point history, semantic callbacks only on changes; adapt app imports and colors |
| Local durable draft | `web/src/lib/durable-draft.ts` | Rename DB/keys for another product; compare revisions and write snapshot atomically; await `flush()` before discarding work |
| Palm/native-menu policy | `web/src/lib/native-interactions.ts` | Separate pen contact from hover; preserve native editing inside text fields and scrollable dialogs |
| Archive preview scheduling | `IncantApp.tsx` autosave effect | Check `isDrawing()` immediately before expensive export; cancel timer on unmount/revision change |

These are reusable source modules, not a published package. Copy the small dependency set together first. Extract a shared package only after a second app demonstrates the common API. A second app should inject database names, colors, error messages and archive callbacks rather than import Incant's room or cloud service.

## Input rules worth preserving

- Capture on accepted contact and accept only the owning pointer. Hover and barrel-only events are not ink. Back-of-pen eraser signaling remains pixel erasing through the same segment renderer.
- Consume every available coalesced sample. Do not throw away intermediate points in favor of the last event. One screen-bounds read per batch is sufficient; refresh next batch so resize/scroll mapping stays correct.
- A real `pointerup` has a useful endpoint. Cancellation, capture loss, blur and hover do not: commit received geometry without drawing a line to their coordinates.
- If a sequence reports no contact and then resumes contact before a terminal up/cancel, begin a separate segment. Do not bridge the hover gap. This is defensive handling, not evidence that the DC-1 emits malformed samples.
- CSS-only viewport changes do not erase the bitmap. Repaint history only when the intrinsic bitmap changes, on hydration, or for explicit clear/undo/redo. Scale existing normalized geometry without stretching its aspect ratio.
- Keep committed stroke objects immutable. The rounded-stroke WeakMap assumes this. Undo/redo moves those same objects; editing a committed stroke later would require cache invalidation.
- Avoid React state updates per sample. A future smoothing or prediction layer must never replace the authoritative received points with speculative geometry.

## What we borrowed—and what we did not

The [W3C Pointer Events specification](https://www.w3.org/TR/pointerevents/) supplies the coalesced-event, capture and terminal-event model. Incant uses those primitives directly.

[tldraw's input handling](https://tldraw.dev/sdk-features/input-handling) separates input tracking from tool state and queues move processing by frame; its [performance documentation](https://tldraw.dev/sdk-features/performance) stresses limiting unnecessary work. We adopted the separation principle and removal of redundant work, retaining immediate incremental Canvas painting because its existing feel was good on DC-1. We did not import tldraw or introduce an infinite canvas.

[perfect-freehand](https://github.com/steveruizok/perfect-freehand) converts input points into a pressure-sensitive outline with configurable smoothing and streamlining. It could be an optional brush later. It cannot recover events the browser never delivered, and stronger smoothing can lag or alter handwriting geometry. No new smoothing dependency or altered brush style is included here.

We did not infer internal implementations for FigJam or Jamboard from their appearance.

## Verification and future measurements

`web/tests/ink-pipeline.e2e.ts` covers terminal endpoints, a 40-sample coalesced batch, interrupted-stroke persistence/reload, paused optional work, monotonic legacy revision migration, one large serialization per save, and contact resumption without a hover bridge. Existing native-interaction and durable-failure tests cover erasing/barrel input, fallback recovery and refusal to clear unsaved work. The focused baseline reproduced a missing endpoint and a PNG export during the next stroke before the fixes.

Operation-count assertions are intentionally distinct from latency budgets. On a 30,000-point fixture, steady saves now read zero old full drawings instead of one and perform one large serialization instead of two. A 40-sample batch now reads layout once instead of forty times. These prove reduced work, not a particular millisecond improvement on the tablet.

Still bounded by whole-snapshot validation and IndexedDB cloning on each commit. If long drawing sessions remain slow, measure this on DC-1 before adopting an append-only stroke journal or worker. Those would be a separate persistence design with migration, compaction, undo and crash-recovery tests. Also measure archive/library scanning during background backup; this pass does not move it to a worker.

For a useful device trace, capture event type, pointer ID, buttons, pressure, event timestamp, coalesced count, handler duration and long-task times in a bounded opt-in ring buffer. Avoid coordinates, audio and artwork. Correlate stalls with pen lifts, PNG encoding, viewport resize, `pointercancel` and contact-bit gaps. This diagnostic is a follow-up proposal, not an installed telemetry feature.

Hands-on acceptance: portrait and landscape, small handwriting/flicks, several minutes of continuous sketching, normal palm contact, eraser, undo/redo, background/return, offline drawing, then reload. Compare the same drawing workload on the same DC-1 build. Do not use a desktop synthetic test or a single warm launch to certify physical pen latency.

Format limits remain 2,000 strokes and 20,000 samples per stroke. Very long individual strokes and very large pages need explicit future handling; this pass does not claim unbounded ink. The canvas is finite and backed by a bitmap up to 1536 pixels per side.
