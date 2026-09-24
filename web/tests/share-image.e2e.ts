import { test, expect } from "@playwright/test";

for (const [mime, extension] of [
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
] as const) {
  test(`native ${extension} parcel keeps matching names, MIME, and exact bytes`, async ({
    page,
  }) => {
    await page.goto("/");
    const result = await page.evaluate(
      async ({ mime, extension }) => {
        const canvas = document.createElement("canvas");
        canvas.width = 3;
        canvas.height = 2;
        const context = canvas.getContext("2d")!;
        context.fillStyle = "#643a91";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#e8c66a";
        context.fillRect(1, 0, 2, 1);
        const data = canvas.toDataURL(mime, 0.91);
        const expected = Array.from(
          new Uint8Array(await (await fetch(data)).arrayBuffer()),
        );
        let shared: File[] = [];
        Object.defineProperty(navigator, "canShare", {
          configurable: true,
          value: () => true,
        });
        Object.defineProperty(navigator, "share", {
          configurable: true,
          value: async (payload: ShareData) => {
            shared = payload.files || [];
          },
        });
        // @ts-expect-error Vite serves this browser module during E2E.
        const { shareImage } = await import("/src/lib/share-image.ts");
        await shareImage({
          id: `${extension}-fixture`,
          image: data,
          sketch: data,
          spell: `${extension} spell`,
          created: 1,
        });
        return {
          expected,
          files: await Promise.all(
            shared.map(async (file) => ({
              name: file.name,
              type: file.type,
              bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
            })),
          ),
        };
      },
      { mime, extension },
    );
    expect(result.files).toEqual([
      { name: `sketch-magic-image.${extension}`, type: mime, bytes: result.expected },
      {
        name: `sketch-magic-original-sketch.${extension}`,
        type: mime,
        bytes: result.expected,
      },
    ]);
  });
}
