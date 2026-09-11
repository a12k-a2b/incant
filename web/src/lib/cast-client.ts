import type { IncantSettings } from "./settings";
export async function requestCast(
  sketch: string,
  words: string,
  settings: IncantSettings,
  variation: number,
  signal: AbortSignal,
): Promise<string> {
  const res = await fetch("/api/cast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      openaiKey: settings.openaiKey,
      sketchPngBase64: sketch,
      incantation: words,
      livePaper: settings.livePaper,
      quality: settings.quality,
      model: settings.model,
      variationIndex: variation,
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok)
    throw new Error(
      body?.error ||
        "The image service could not finish. Your sketch is safe. Try again.",
    );
  if (typeof body.imageBase64 !== "string" || !body.imageBase64)
    throw new Error("The spell returned no image. Try again.");
  return `data:image/png;base64,${body.imageBase64}`;
}
