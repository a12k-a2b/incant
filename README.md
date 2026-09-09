# Incant

A wizard’s canvas for the [Daylight DC-1](https://daylightcomputer.com). Draw a sketch with the stylus, hold the wand and speak a spell, release — the sketch transfigures into a finished image.

**Draw. Speak. Transfigure.**

## How Sketch actually works

ChatGPT **Sketch** (`@Sketch`) is a ChatGPT product surface, not a separate developer API. There is no dedicated “sketch mode” endpoint.

The same capability is available to apps through the **Images API**:

- Model: `gpt-image-2.5-flare` (fast) or `gpt-image-2.5-sunburst` (precise)
- Endpoint: `POST /v1/images/edits`
- You send the sketch as the reference image and the spoken (or typed) spell as the prompt

That is the official “turn a drawing into a realistic image” workflow. Incant uses it. An iframe of ChatGPT is unnecessary.

Voice uses **Gemini 3.5 Live Transcribe** (`gemini-3.5-transcribe-live`) over the Live API, push-to-talk / manual VAD — hold the wand, speak, release to finalize.

## Using it on a DC-1

The live app is a portrait, grayscale-first parchment UI with software palm rejection (canvas ignores finger/touch; only pen and mouse draw). The DC-1’s Wacom EMR layer already rejects palms in hardware; Incant double-filters.

1. Open the web app in the DC-1 browser, or install it as a PWA.
2. Open **Grimoire** and paste an OpenAI key and a Gemini key. Keys stay on the device.
3. Draw. Hold the wand. Speak. Release.

There is also a native **Jetpack Compose** app in [`android/`](android/) for sideloading:

- Custom `SketchView` with stylus pressure and palm rejection (`TOOL_TYPE_FINGER` ignored)
- Hold-to-talk wand
- Same OpenAI + Gemini wiring

Open `android/` in Android Studio, let Gradle sync, run on the DC-1.

## Product choices

- **One visage first.** Casting generates one image so it returns quickly. **Another** weaves a new interpretation of the same sketch + spell. Previous results collect as **echoes** along the bottom.
- **Fourfold visages** (Grimoire toggle, off by default) fires four in parallel. The first to return becomes the large image; the rest fill in as echoes. Four tiny thumbnails of similar images are hard to tell apart on Live Paper, so the large image stays primary.
- **Compose for Live Paper** (on by default) asks the model for strong value contrast so the result still reads in grayscale.
- You can always **type** the spell if the microphone is unavailable.

## Grimoire keys

| Key | Used for |
|---|---|
| OpenAI | `gpt-image-2.5-flare` / `sunburst` image edits |
| Gemini | `gemini-3.5-transcribe-live` push-to-talk |

Keys never leave the device except to those APIs.
