import { createFileRoute } from "@tanstack/react-router";
import { editSketchToImage, type CastRequest } from "@/lib/openai-images.server";
import { MODEL_OPTIONS, QUALITY_OPTIONS } from "@/lib/settings";

export const Route = createFileRoute("/api/cast")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: Partial<CastRequest>;
        try {
          body = (await request.json()) as Partial<CastRequest>;
        } catch {
          return Response.json(
            { ok: false, error: "The spell arrived garbled." },
            { status: 400 },
          );
        }

        const quality = QUALITY_OPTIONS.includes(
          body.quality as (typeof QUALITY_OPTIONS)[number],
        )
          ? (body.quality as (typeof QUALITY_OPTIONS)[number])
          : "medium";
        const model = MODEL_OPTIONS.includes(
          body.model as (typeof MODEL_OPTIONS)[number],
        )
          ? (body.model as (typeof MODEL_OPTIONS)[number])
          : "gpt-image-2.5-flare";

        const result = await editSketchToImage({
          openaiKey: typeof body.openaiKey === "string" ? body.openaiKey : "",
          sketchPngBase64:
            typeof body.sketchPngBase64 === "string" ? body.sketchPngBase64 : "",
          incantation:
            typeof body.incantation === "string" ? body.incantation : "",
          livePaper: body.livePaper !== false,
          variationIndex:
            typeof body.variationIndex === "number" ? body.variationIndex : 0,
          quality,
          model,
          size: typeof body.size === "string" ? body.size : "1024x1536",
        });

        return Response.json(result, { status: result.ok ? 200 : 400 });
      },
    },
  },
});
