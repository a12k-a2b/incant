import type { Creation } from "./collection";
function imageExtension(type: string) {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/webp") return "webp";
  return "png";
}
export function imageFile(c: Creation) {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/is.exec(c.image);
  if (!match) throw new Error("This image is unavailable for sharing.");
  const raw = atob(match[2]),
    bytes = Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
  return new File([bytes], `incant-${c.id}.${imageExtension(match[1])}`, {
    type: match[1],
  });
}
export function saveImage(c: Creation) {
  const a = document.createElement("a");
  a.href = c.image;
  a.download = imageFile(c).name;
  a.click();
}
export type ShareImageResult = "shared" | "cancelled";

export async function shareImage(
  c: Creation,
  options: { url?: string } = {},
): Promise<ShareImageResult> {
  // Construct the file synchronously so Android receives the original tap activation.
  const rendered = imageFile(c);
  const files = [
    new File([rendered], `incant-image.${imageExtension(rendered.type)}`, {
      type: rendered.type,
    }),
  ];
  if (c.sketch) {
    const sketch = imageFile({ ...c, image: c.sketch });
    files.push(
      new File(
        [sketch],
        `incant-original-sketch.${imageExtension(sketch.type)}`,
        { type: sketch.type },
      ),
    );
  }
  if (!navigator.share || !navigator.canShare?.({ files }))
    throw new Error(
      "Image sharing is unavailable in this browser. Use Save, then share the image from Files.",
    );
  try {
    await navigator.share({
      files,
      title: "A small act of sorcery",
      text: `I drew it, muttered “${c.spell}”, and the parchment got carried away.`,
      ...(options.url ? { url: options.url } : {}),
    });
    return "shared";
  } catch (e) {
    if ((e as Error).name === "AbortError") return "cancelled";
    throw e;
  }
}
