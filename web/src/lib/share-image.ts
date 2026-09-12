import type { Creation } from "./collection";
export function imageFile(c: Creation) {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/is.exec(c.image);
  if (!match) throw new Error("This image is unavailable for sharing.");
  const raw = atob(match[2]),
    bytes = Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
  return new File(
    [bytes],
    `incant-${c.id}.${match[1] === "image/jpeg" ? "jpg" : "png"}`,
    { type: match[1] },
  );
}
export function saveImage(c: Creation) {
  const a = document.createElement("a");
  a.href = c.image;
  a.download = imageFile(c).name;
  a.click();
}
export async function shareImage(c: Creation) {
  // Construct the file synchronously so Android receives the original tap activation.
  const files = [imageFile(c)];
  if (c.sketch)
    files.push(
      new File(
        [imageFile({ ...c, image: c.sketch })],
        "incant-original-sketch.png",
        { type: "image/png" },
      ),
    );
  if (!navigator.share || !navigator.canShare?.({ files }))
    throw new Error(
      "Image sharing is unavailable in this browser. Use Save, then share the image from Files.",
    );
  try {
    await navigator.share({
      files,
      title: "A small act of sorcery",
      text: `I drew it, muttered “${c.spell}”, and the parchment got carried away.`,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return;
    throw e;
  }
}
