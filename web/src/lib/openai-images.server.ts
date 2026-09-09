import { resolveOpenaiKey } from "./secrets.server";
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

const FALLBACK_MODEL = "gpt-image-2";

function stripDataUrl(raw: string): string {
  const trimmed = raw.trim();
  const comma = trimmed.indexOf(",");
  if (trimmed.startsWith("data:") && comma !== -1) {
    return trimmed.slice(comma + 1);
  }
  return trimmed;
}

function isModelUnavailable(status: number, message: string): boolean {
  const m = message.toLowerCase();
  return (
    status === 404 ||
    m.includes("does not exist") ||
    m.includes("model_not_found") ||
    m.includes("invalid model") ||
    (m.includes("model") && m.includes("not found")) ||
    m.includes("must be verified") ||
    m.includes("verify organization")
  );
}

async function postEdit(key: string, form: FormData): Promise<{
  status: number;
  body: {
    error?: { message?: string };
    data?: { b64_json?: string; url?: string }[];
  } | null;
}> {
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
  } catch {
    return { status: 0, body: { error: { message: "The circle could not reach OpenAI." } } };
  }
  const body = (await res.json().catch(() => null)) as {
    error?: { message?: string };
    data?: { b64_json?: string; url?: string }[];
  } | null;
  return { status: res.status, body };
}

function buildForm(
  input: CastRequest,
  prompt: string,
  bytes: Buffer,
  model: string,
): FormData {
  const form = new FormData();
  form.append("model", model);
  form.append("prompt", prompt);
  form.append("size", input.size ?? "1024x1536");
  form.append("quality", input.quality);
  form.append(
    "image",
    new File([new Uint8Array(bytes)], "sketch.png", { type: "image/png" }),
  );
  return form;
}

export async function editSketchToImage(
  input: CastRequest,
): Promise<CastResult> {
  const key = resolveOpenaiKey(input.openaiKey);
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

  const requested: string = input.model;
  let { status, body } = await postEdit(
    key,
    buildForm(input, prompt, bytes, requested),
  );

  if (!body && status === 0) {
    return { ok: false, error: "The circle could not reach OpenAI." };
  }

  const firstMessage = body?.error?.message ?? "";
  if (
    !body?.data?.[0] &&
    requested !== FALLBACK_MODEL &&
    isModelUnavailable(status, firstMessage)
  ) {
    ({ status, body } = await postEdit(
      key,
      buildForm(input, prompt, bytes, FALLBACK_MODEL),
    ));
  }

  if (status === 0) {
    return { ok: false, error: "The circle could not reach OpenAI." };
  }

  if (status < 200 || status >= 300) {
    const message =
      body?.error?.message ??
      `The spell was refused (${status}). Check the OpenAI key and model access.`;
    return { ok: false, error: message, status };
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
