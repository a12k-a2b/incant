import { createFileRoute } from "@tanstack/react-router";
import { resolveGeminiKey } from "@/lib/secrets.server";

export const Route = createFileRoute("/api/gemini-token")({
  server: {
    handlers: {
      GET: async () => {
        const key = resolveGeminiKey();
        return Response.json({ ok: Boolean(key), ready: Boolean(key) });
      },
      POST: async ({ request }) => {
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
      },
    },
  },
});
