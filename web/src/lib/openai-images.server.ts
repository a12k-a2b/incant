import { buildSpellPrompt } from "./prompt";
import type { ImageModel, ImageQuality } from "./settings";

export type CastRequest = {
  openaiKey: string;
  sketchPngBase64: string;
  incantation: string;
  livePaper: boolean;
  variationIndex?: number;
  quality: ImageQuality;
  model: ImageModel;
  size?: string;
};

export type CastResult =
  | { ok: true; imageBase64: string; mime: string }
  | { ok: false; error: string; status?: number };

function stripDataUrl(raw: string): string {
  const trimmed = raw.trim();
  const comma = trimmed.indexOf(",");
  if (trimmed.startsWith("data:") && comma !== -1) {
    return trimmed.slice(comma + 1);
  }
  return trimmed;
}

export async function editSketchToImage(
  input: CastRequest,
): Promise<CastResult> {
  const key = input.openaiKey.trim();
  if (!key) {
    return { ok: false, error: "An OpenAI key is needed to cast." };
  }
  const png = stripDataUrl(input.sketchPngBase64);
  if (!png) {
    return { ok: false, error: "The parchment is empty." };
  }

  const bytes = Buffer.from(png, "base64");
  if (bytes.length < 32) {
    return { ok: false, error: "The sketch could not be read." };
  }

  const prompt = buildSpellPrompt({
    incantation: input.incantation,
    livePaper: input.livePaper,
    variationIndex: input.variationIndex,
  });

  const form = new FormData();
  form.append("model", input.model);
  form.append("prompt", prompt);
  form.append("size", input.size ?? "1024x1536");
  form.append("quality", input.quality);
  form.append(
    "image",
    new File([bytes], "sketch.png", { type: "image/png" }),
  );

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
  } catch {
    return { ok: false, error: "The circle could not reach OpenAI." };
  }

  const body = (await res.json().catch(() => null)) as
    | {
        error?: { message?: string };
        data?: { b64_json?: string; url?: string }[];
      }
    | null;

  if (!res.ok) {
    const message =
      body?.error?.message ??
      `The spell was refused (${res.status}). Check the OpenAI key and model access.`;
    return { ok: false, error: message, status: res.status };
  }

  const first = body?.data?.[0];
  if (first?.b64_json) {
    return { ok: true, imageBase64: first.b64_json, mime: "image/png" };
  }
  if (first?.url) {
    try {
      const imgRes = await fetch(first.url);
      const buf = Buffer.from(await imgRes.arrayBuffer());
      return {
        ok: true,
        imageBase64: buf.toString("base64"),
        mime: imgRes.headers.get("content-type") || "image/png",
      };
    } catch {
      return { ok: false, error: "The manifestation slipped away." };
    }
  }

  return { ok: false, error: "OpenAI returned no image." };
}
