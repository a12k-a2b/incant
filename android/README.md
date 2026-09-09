# Incant for Android (Daylight DC-1)

Native Kotlin + Jetpack Compose app.

- `SketchView` — stylus-only drawing, pressure, eraser barrel, palm (`TOOL_TYPE_FINGER`) ignored
- Wand — hold to speak (Gemini 3.5 Live Transcribe), release to cast
- `OpenAiCast` — `gpt-image-2.5-flare` image edits, portrait `1024x1536`

Open this folder in Android Studio (Ladybug / 2024.2+), sync Gradle, run on the DC-1 (Android 13 / SolOS).

Required permissions: microphone, internet.
