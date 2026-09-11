# Incant — the drawing room

A little ink. A few words. A world of your own.

Incant turns **your sketch** into a finished image. The drawing fixes composition, placement and proportions; your spoken or typed spell supplies material, atmosphere and detail. A wizard’s parchment, a quill, and a small act of transformation.

## Open on Daylight

The private PWA is hosted at **https://incant-web-production.up.railway.app**. Use the room passphrase supplied separately. On DC-1, open it in a current browser, then choose **Install app** or **Add to Home screen**. No provider key is needed on the device when the hosted server is configured.

1. Draw with a stylus (or mouse). Finger strokes are ignored.
2. Hold **Hold to speak**, wait for **Listening**, and describe what the drawing should become. Release to cast. Keyboard users can hold Space or Enter on the same button.
3. Or type the incantation and choose **Cast spell**.
4. Save an image, return to your sketch, or try another interpretation. Finished images collect in the local spellbook.

The drawing and spell are saved in this browser. After the installed app shell has loaded once, it can reopen offline for drawing. Voice and image generation need a connection. Download is the durable copy you can keep outside browser storage; clearing site data removes local drafts and images.

## What changed

- A grayscale-conscious illustrated worktable with a larger parchment, visible tools, readable spell controls and responsive portrait/landscape layouts.
- A runnable Vite/React app with a small Express server, production Docker build and Railway configuration. The prior web export was missing build files and referenced absent host components.
- Vector stroke history instead of full-screen bitmap copies. Coalesced input, fixed tool per stroke, consistent canvas/export aspect ratio, undo/redo and persistent drafts.
- Bounded casts; failed requests settle; previous images/sketch remain available; cancelled requests cannot replace the active page.
- Final speech is passed directly into casting; early release stops a late microphone grant; listening stops when the app is hidden and after one minute.
- A private room gate, secure session cookies, request limits and server-held API keys. No silent model fallback.
- Install manifest and offline app-shell cache. API responses and secrets are never cached by the service worker.

## Local development

Requires Node 22.12+.

```sh
cd web
npm ci
cp .env.example .env
# Set provider keys in .env. Do not commit it.
npm run dev
```

Open http://localhost:5173. For production, set `APP_ACCESS_KEY` to a long private passphrase, then run `npm run build` and `npm start`. Set `HOST=0.0.0.0` on a server. Railway uses the supplied Dockerfile.

Tests: `npm test`, `npm run build`, `npm run test:e2e` (local server required; run `npx playwright install chromium` once). `CHROME_PATH` optionally selects an existing Chromium executable.

Within SolOS, the common harness is:

```sh
./bin/daylight-qa --config incant/qa-projects.json run --profile pr --project incant-web
```

## How the keys and requests travel

Daylight → Incant on Railway → OpenAI image edits → Daylight.

Railway keeps `OPENAI_API_KEY`, `GEMINI_API_KEY` and `APP_ACCESS_KEY` in service variables. For voice, Railway issues a one-use short-lived Gemini token; microphone audio streams from the device to Gemini. It does not pass through Railway. In local bring-your-own-key mode, keys entered in the Spellbook are stored in the browser and sent through your app server to the relevant provider. Use only an app server you trust.

The server does not persist sketches or generated images. The providers receive the content necessary for the requested generation/transcription. Provider API charges and Railway hosting charges apply. Cancelling after submission stops waiting; it cannot guarantee reversal of provider work or billing. The hourly request limit is per running instance and resets on restart; it is not an account spending cap.

## PWA versus native ink

The PWA is the primary implementation in this pass. The existing [`android/`](android/) export remains an unverified prototype; its known voice/lifecycle/inking gaps are not advertised as fixed. See [the ink architecture decision](docs/INK-ARCHITECTURE.md) for the note-overlay reuse assessment. Native ink extraction should follow a measured DC-1 pen-latency comparison.

## Evidence and remaining work

See [verification contract](docs/QA-CONTRACT.md), [QA report](docs/evidence/qa-pr/report.md), and [prompt tournament protocol](docs/prompt-tournament/protocol.md). Synthetic browser and live-provider evidence are separate. Actual DC-1 latency, Wacom behavior, suspend/wake, battery and physical UX acceptance remain **BLOCKED / manual** until tested on the device.

API references: [OpenAI sketch-to-render prompting](https://developers.openai.com/api/docs/guides/image-prompting#turn-a-drawing-into-a-realistic-image), [Gemini Live transcription](https://ai.google.dev/gemini-api/docs/live-api/live-transcribe). The published recipe is an API baseline; no private ChatGPT Sketch system prompt is claimed.

## Prompt and deployment evidence

The selected P04 prompt was chosen from seven candidates across 30 generated test images, judged by Fable and Astra. See [results and limitations](docs/prompt-tournament/RESULTS.md).

The final [repository QA profile](docs/evidence/qa-pr-final/report.md) passed the build, five unit checks, and thirteen browser scenarios. [Hosted checks](docs/evidence/hosted-smoke.json) verify private access and offline draft persistence; [the real hosted cast](docs/evidence/hosted-final-provider.json) returned an image and verified live voice setup. [Deployment provenance](docs/evidence/deployment-final.json) identifies the Railway image and source hashes. These do not certify physical DC-1 pen latency, microphone behavior, or release readiness on hardware.

## Android web app for Run13

The current illustrated parchment revision includes an installable Chrome-based APK in `android-web`. See [packaging and canvas details](docs/PARCHMENT-AND-ANDROID.md). It is separate from the unverified native Android prototype.
