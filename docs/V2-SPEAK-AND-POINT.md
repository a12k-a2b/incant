# V2: explain an idea with a sketch, speech and pointing

Status: saved design proposal, not implemented. V1 remains installed on the owner's Run13 DC-1. The owner explicitly asked to defer this workflow until after the first APK.

## Product purpose

Incant helps someone communicate an idea that is difficult to explain in words alone. A rough sketch establishes structure; speech supplies meaning; pointing tells the system which part the words refer to. The output should let another person understand the intended idea. A polished explanatory diagram, layout or concept illustration can be more useful than a realistic painting.

The wizard motif makes this approachable: a quill to draw, a wand to explain, parchment that becomes a clearer expression of the idea. It should support ordinary speech, not require magical vocabulary or object names.

Success is preservation and comprehension: intended entities, relationships, proportions, placement, mechanisms and requested changes survive. Visual finish supports that purpose. Ambiguity stays visible until resolved, rather than being replaced by a confident invention.

## Interaction

1. Draw normally. Tap “Speak & point” to start a visibly recording session; tap “Finish” to stop. This frees the pen, unlike V1's hold-to-speak gesture. Include Cancel and automatic stop on backgrounding/interruption; retain the sketch.
2. Freeze the source drawing revision. During this mode the stylus is a wand pointer: taps select locations; a small circle selects a region; dwelling points at a form. Its temporary trail is separate from ink and fades. Do not add these marks to undo history, the source drawing or the render input.
3. Show a restrained halo/dotted outline over the currently referenced region. Use contrast and shape rather than color alone on Daylight. Hover is optional because hardware/browser support may differ; contact must work.
4. Interpret speech with those selections. Keep the most recent deliberate selection active through the relevant clause, while retaining the full history for “the other one,” “between these,” or later corrections.
5. On Finish, resolve the complete explanation. Show a small set of region-linked instruction summaries. Ask a focused question only when a material reference is uncertain: “This bottle, or the one beside it?” A tap fixes the binding without rerecording the whole spell.
6. Cast once the meaning is clear. Preserve sketch, result and the explanation together. Provide straightforward save/share of the result, with optional source sketch and concise caption; do not automatically transmit it to another person.

First scope: taps/dwells and circles around existing sketch elements, plus speech corrections. Directional tracing and gesture-driven animation/mechanical behavior are later scope, not silently interpreted as simple pointing.

## A small interpreter before the image generator

Implement one module/endpoint in the existing Railway application, not a new fleet of services. Prototype `POST /api/interpret-spell` with bounded session input and structured output. The image generation endpoint remains a separate action.

### Capture

The client records a frozen sketch PNG, normalized vector strokes, its dimensions and revision/hash; actual stylus events with monotonic timestamps, normalized coordinates, pressure and event type; and microphone samples with a sample-index-to-session-clock mapping. Also record capture start/stop, resampling offsets, pauses and interruptions. Establish the mapping when capture begins, not when remote text arrives. After reconnect, start an explicit new clock segment.

Use sample timing and original/coalesced pointer-event timestamps. Do not use network arrival order, `Date.now()` or fabricated timestamps for individual words. Predicted pen samples may improve local display but must not be evidence for what the owner actually pointed at.

Keep raw audio transient for the session/final alignment and discard it by default when the cast/cancellation is finished. Optional retained evaluation sessions need the owner's explicit choice. Do not put audio or transcript content into ordinary server logs. Keep provider credentials on the existing authorized routes.

### Align speech

V1 currently collapses the Gemini stream into text and uses SMART mode. V2 needs a verbatim source stream so false starts, deictic words and corrections remain available. A cleaned caption is a separate derived representation.

The model-specific Live Transcribe documentation currently states utterance-level timestamps, not live word-level timestamps. The generic API surface mentions word timestamp fields; their existence does not prove support for this streaming model. Start with provisional utterance/selection associations for immediate feedback. At Finish, obtain word/phrase timing from a verified timestamp-capable non-streaming transcription/alignment pass over the same captured audio when multiple selections occur within an utterance. Gemini's non-streaming transcription documentation provides a candidate route; verify actual timestamp accuracy and offsets empirically before depending on it. Do not claim that this currently works in V1.

People may point before, during or just after saying “this.” Use an empirically tuned time window and selection persistence, not exact nearest-event matching. Long pauses, overlap and self-correction need explicit handling. Keep alternative bindings when timing alone cannot decide.

### Resolve regions and meaning

Geometry provides candidates: nearby strokes, enclosing circle, dwell point, bounds and overlap. A vision-language interpreter then sees the original sketch plus a separately labeled reference view, the timed transcript and these candidate events. It determines whether a region is an object, part of one, empty space for an addition, or a relationship between several objects. Do not assume a connected stroke group equals one object, or snap every point to the nearest named object.

Require structured output with region IDs, the evidence spans supporting each binding, requested properties/edits, preserved constraints, corrections and unresolved alternatives. Model-reported confidence alone is not a calibrated probability; use agreement with capture evidence, validation and measured abstention behavior to decide whether to ask the owner.

Example (illustrative schema, times are synthetic):

```json
{
  "sketchRevision": "frozen-revision-id",
  "bindings": [
    {
      "phrase": "this should be a glass chamber",
      "speechSpanMs": [2100, 4100],
      "gestureIds": ["g3"],
      "regionId": "r1",
      "requestedChange": {"material": "transparent glass"},
      "preserve": ["position", "outline", "proportions"]
    },
    {
      "phrase": "water flows from here into that",
      "gestureIds": ["g4", "g5"],
      "relationship": {"kind": "flow", "fromRegion": "r1", "toRegion": "r2"}
    }
  ],
  "unresolved": []
}
```

### Compile a rendering request

Send the image model the clean original sketch, a separate region-reference image if supported, and the resolved instructions. Never send only a text description and discard the visual evidence. Do not burn circles, pointer trails, IDs or debug labels into the source sketch.

Example resolved instruction: “Keep the original layout. The tall enclosed form on the left, identified as R1 in the reference view, is a transparent glass chamber. The small form on the right, R2, is a reservoir. Show water flowing from R1 to R2 along the existing connecting line. Preserve their footprints and spacing. Use a clear explanatory illustration. Reference markers are not part of the output.”

The image request should preserve geometry by default but allow explicit local changes, additions or connections that the owner described. Unspecified appearance should support explanation; uncertain material/mechanism must not become an invented engineering claim. Explain dynamic ideas in a static image through requested arrows, sequence panels or a caption only where appropriate. The generator is a renderer of the resolved intent, not the only place where reference resolution happens.

## Evaluation before release

Build a replayable set of sketch + audio + gesture recordings with independently labeled intended references. Include two similar adjacent shapes; ambiguous scribbles; overlapping parts; pointing before/after speech; several references in one sentence; corrections; grouped selections; empty-space additions; relative phrases; moving gestures; missed samples; long pauses; denied mic permission; cancellation; rotation; reconnect and reordered transcript events. Use synthetic data first and opt-in owner examples later.

Compare transcript-only, naïve nearest-time binding and the proposed resolver. Include an intentionally shuffled gesture timeline as a negative control. Measure binding accuracy, incorrect confident bindings, useful clarification frequency, speech correction handling, latency after Finish and user effort. Keep interpreter correctness separate from image adherence: a correct binding with a wrong image is a rendering failure.

Use Fable/Astra visual review on held-out triplets as in V1, while adding a communication test: can another person correctly describe the intended components and relationships from the output? Evaluate diagrams, room/object layouts and mechanisms as well as illustrations. A prettier image with the wrong explanation fails. Pre-register acceptance thresholds after a pilot; no release criteria or accuracy claims are established yet.

## Proposed sequence

- V1: owner tests installed APK for pen feel, palm behavior, microphone and core sketch-to-image reliability.
- V2 prototype: separate pointer layer, session recording/replay, timestamp alignment and visible region binding. Test interpretation before spending on image calls.
- V2 integration: structured resolver, focused correction UI and compiled render request; empirical comparison with V1.
- Later: directional motion gestures, multi-step explanations and optional shareable sketch/explanation/result bundles.

## Sources checked 2026-09-10

- https://ai.google.dev/gemini-api/docs/live-api/live-transcribe — live utterance timing, verbatim versus SMART, current word-timing limitation.
- https://ai.google.dev/gemini-api/docs/transcribe — candidate non-streaming word-annotation route; model/format/accuracy must still be tested.
- https://www.w3.org/TR/pointerevents3/ — coalesced pointer-event timestamps; distinguish actual and predicted input.

This document is a design proposal grounded in the owner's product intent and inspected V1 code. It makes no claim of novel research, implemented multimodal grounding or measured V2 accuracy.
