import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("incant-introduction-v1", "seen"),
  );
});

test("a corrupt new fallback cannot hide a valid old-format draft", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("incant-drawing-v2-snapshot", "{broken");
    localStorage.setItem(
      "incant-drawing-v2",
      JSON.stringify([
        {
          eraser: false,
          points: [
            { x: 0.2, y: 0.4, p: 0.5 },
            { x: 0.8, y: 0.4, p: 0.5 },
          ],
        },
      ]),
    );
    localStorage.setItem(
      "incant-drawing-v2-size",
      JSON.stringify({ w: 1024, h: 1536 }),
    );
  });
  await page.goto("/");
  const recovered = await page.evaluate(async () => {
    const path = "/src/lib/durable-draft.ts";
    return (await import(path)).loadDurableDraft();
  });
  expect(recovered).toMatchObject({
    revision: 0,
    drawing: [{ points: [{ x: 0.2 }, { x: 0.8 }] }],
  });
  await expect
    .poll(() =>
      page.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
        const context = canvas.getContext("2d")!;
        return context.getImageData(
          Math.floor(canvas.width * 0.5),
          Math.floor(canvas.height * 0.4),
          1,
          1,
        ).data[0];
      }),
    )
    .toBeLessThan(100);
});

test("overlapping saves cannot let an older revision regress either store", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const path = "/src/lib/durable-draft.ts",
      drafts = await import(path),
      make = (revision: number) => ({
        drawing: [
          {
            eraser: false,
            points: [{ x: revision / 100, y: 0.5, p: 0.5 }],
          },
        ],
        size: { w: 1024, h: 1536 },
        revision,
      });
    await Promise.all([
      drafts.saveDurableDraft(make(12)),
      drafts.saveDurableDraft(make(10)),
      drafts.saveDurableDraft(make(11)),
    ]);
    const fallback = JSON.parse(
      localStorage.getItem("incant-drawing-v2-snapshot")!,
    );
    localStorage.removeItem("incant-drawing-v2-snapshot");
    const durable = await drafts.loadDurableDraft();
    return { fallback, durable };
  });
  expect(result.fallback.revision).toBe(12);
  expect(result.durable.revision).toBe(12);
  expect(result.durable.drawing[0].points[0].x).toBe(0.12);
});

test("when both draft stores fail the moon keeps the visible sketch downloadable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (indexedDB as any).open = () => {
      throw new DOMException("Synthetic IndexedDB outage", "UnknownError");
    };
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("incant-drawing-v2"))
        throw new DOMException("Synthetic quota", "QuotaExceededError");
      return setItem.call(this, key, value);
    };
  });
  await page.goto("/?mode=desk");
  const canvas = page.locator("canvas"),
    bounds = await canvas.boundingBox();
  await page.mouse.move(
    bounds!.x + bounds!.width * 0.2,
    bounds!.y + bounds!.height * 0.5,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds!.x + bounds!.width * 0.8,
    bounds!.y + bounds!.height * 0.5,
  );
  await page.mouse.up();
  await expect(page.locator(".room-message")).toContainText(
    "could not save your draft",
  );
  const visible = await canvas.evaluate((node: HTMLCanvasElement) =>
    node.toDataURL(),
  );

  await page.getByRole("button", { name: "New spell — turn the moon" }).click();
  await expect(
    page.getByRole("dialog", { name: "Keep your spell pairs" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "sketch has not been cleared",
  );
  expect(
    await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL()),
  ).toBe(visible);

  await page.getByRole("button", { name: "Keep drawing" }).click();
  await page
    .getByRole("button", { name: "Open desk tools", exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save sketch", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("sketch-magic-sketch.png");
  expect(
    await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL()),
  ).toBe(visible);
});
