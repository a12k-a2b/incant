export type OwlLetter = {
  id: string;
  token: string;
  created: number;
  expires: number;
  revoked: boolean;
  opened?: number;
  handedOff?: number;
  replies: { id: string; created: number }[];
};
export async function owlRequest<T = any>(
  path: string,
  body?: unknown,
  token?: string,
): Promise<T> {
  const r = await fetch("/api/" + (token ? "owl-public" : "owl") + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { "x-owl-key": token } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok)
    throw new Error(
      data?.error || "The owl could not reach the post. Please try again.",
    );
  return data;
}
export async function parchmentPNG(blob: Blob): Promise<string> {
  if (blob.size > 12 * 1024 * 1024)
    throw new Error("Choose an image smaller than 12 MB.");
  if (!["image/png", "image/jpeg", "image/webp"].includes(blob.type))
    throw new Error("Choose a PNG, JPEG, or WebP image.");
  const bitmap = await createImageBitmap(blob);
  try {
    if (bitmap.width * bitmap.height > 40000000)
      throw new Error("This image is too large.");
    const scale = Math.min(1, 1536 / Math.max(bitmap.width, bitmap.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bitmap.width * scale));
    c.height = Math.max(1, Math.round(bitmap.height * scale));
    const x = c.getContext("2d")!;
    x.fillStyle = "#fff";
    x.fillRect(0, 0, c.width, c.height);
    x.drawImage(bitmap, 0, 0, c.width, c.height);
    const data = c.toDataURL("image/png");
    if (data.length > 8 * 1024 * 1024)
      throw new Error(
        "This image is too detailed to send. Try a smaller image.",
      );
    return data;
  } finally {
    bitmap.close();
  }
}
let audio: AudioContext | undefined;
export function wakeOwl() {
  try {
    audio ??= new AudioContext();
    void audio.resume().catch(() => {});
  } catch {
    /* visual notifications remain */
  }
}
export function hoot() {
  if (audio?.state !== "running") return false;
  const now = audio.currentTime;
  for (const [offset, duration] of [
    [0, 0.25],
    [0.36, 0.48],
  ]) {
    const o = audio.createOscillator(),
      g = audio.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(510, now + offset);
    o.frequency.exponentialRampToValueAtTime(355, now + offset + duration);
    g.gain.setValueAtTime(0, now + offset);
    g.gain.linearRampToValueAtTime(0.12, now + offset + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, now + offset + duration);
    o.connect(g);
    g.connect(audio.destination);
    o.start(now + offset);
    o.stop(now + offset + duration + 0.02);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }
  return true;
}
