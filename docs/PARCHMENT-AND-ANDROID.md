# Parchment-first revision and Android test package

Owner feedback: the original desk layout made the drawing surface much too small. The reference was a richly illustrated book-cover surround, with a large rectangular torn parchment occupying roughly 70–80% of the working area.

The new portrait layout uses a continuous original monochrome wizard illustration (owl, moon, dragon, books, foliage, bottles and astrolabe). The canvas bounds occupy 83% of the frame width and 89% of its height, about74% of the working area before tiny aspect rounding. Controls sit in compact strips outside it. The exported sketch excludes the illustrated background. Blank canvas backing pixels are white and blend with the illustrated parchment only for display; this keeps the frame out of API inputs. Landscape uses repeated edge strips to preserve the illustration proportions.

New blank sheets choose dimensions to match the available space, rounded to supported multiples of16 with a maximum1536px edge. Once ink exists, its original dimensions are kept across rotation/reload, with uniform fitting rather than stretching. Existing vector drafts without dimension metadata retain their original1024×1536 space. New page adapts to the current viewport. The server derives generation size from the PNG itself and rejects unsupported dimensions before sending anything upstream. This avoids stretching a large rectangular drawing into the old fixed narrow portrait output.

The selected P04 prompt is unchanged. The original 30-image tournament used fixed1024×1536 fixtures; larger/custom shapes are not a new tournament claim. A subsequent live synthetic cast with the expanded drawing surface succeeded. Official API constraints checked: https://developers.openai.com/api/docs/guides/image-generation#size-and-quality-options

## Android packaging

`android-web` is a small Trusted Web Activity APK (`app.incant.web`), using Chrome to run the same Railway PWA. It is not the old native Compose prototype and not a Chrome-generated WebAPK. It adds an Incant launcher icon without depending on the launcher supporting Chrome's “Add to home screen” flow. Chrome's standard Digital Asset Links verification controls fullscreen mode; no verification bypass or remote-debugging access is used. If verification fails, Chrome retains its address bar.

The owner explicitly authorized installation on the connected Run13 DC-1 and requested the passphrase `daylight`. The master provider keys remain server-side. The wrapper has no provider credentials. Current build is locally debug-signed for owner testing, not a production-store release.

Automatic approval review rejected forwarding Chrome's general remote-debugging interface because it exposes unrelated browser sessions. That diagnostic was abandoned. Installation and inspection use ADB package management and visible UI controls only.

Physical pen latency, palm contact and real spoken microphone behavior remain owner/manual tests; a successful install or visible page is not proof of those outcomes.
