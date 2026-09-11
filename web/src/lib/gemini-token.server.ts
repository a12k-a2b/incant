import { resolveGeminiKey } from "./secrets.server";
export async function mintToken(request: Request): Promise<Response> {
  let override = "";
  try {
    const body = (await request.json()) as { geminiKey?: string };
    if (typeof body.geminiKey === "string") override = body.geminiKey;
  } catch {
    /* empty body is fine */
  }

  const apiKey = resolveGeminiKey(override);
  if (!apiKey) {
    return Response.json(
      { ok: false, error: "No Gemini key is on the canvas yet." },
      { status: 400 },
    );
  }

  const expire = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const newSession = new Date(Date.now() + 2 * 60 * 1000).toISOString();

  let res: Response;
  try {
    res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/auth_tokens",
      {
        method: "POST",
        signal: AbortSignal.timeout(12000),
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          uses: 1,
          expireTime: expire,
          newSessionExpireTime: newSession,
        }),
      },
    );
  } catch {
    return Response.json(
      { ok: false, error: "The transcribe circle could not be reached." },
      { status: 502 },
    );
  }

  const body = (await res.json().catch(() => null)) as {
    name?: string;
    error?: { message?: string };
  } | null;

  if (!res.ok || !body?.name) {
    return Response.json(
      {
        ok: false,
        error:
          body?.error?.message ??
          "Gemini refused a listening token. Check the key in the Grimoire.",
      },
      { status: 400 },
    );
  }

  return Response.json({ ok: true, token: body.name });
}
