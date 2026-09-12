import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("incant-introduction-v1", "seen"),
  );
});

for (const [name, width, height, path] of [
  ["dc1-portrait", 1184, 1584, "/"],
  ["dc1-landscape", 1584, 1184, "/"],
  ["big-frame portrait", 1184, 1584, "/?frame=big"],
  ["big-frame landscape", 1584, 1184, "/?frame=big"],
] as const) {
  test(`blank parchment remains drawable beside the moon in ${name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto(path);
    const canvas = page.locator("canvas");
    const paper = (await page.locator(".paper").boundingBox())!;
    const x = paper.x + paper.width * 0.88;
    const y = paper.y + paper.height * 0.13;

    expect(
      await page.evaluate(
        ([x, y]) =>
          document
            .elementFromPoint(x, y)
            ?.closest("button")
            ?.getAttribute("aria-label") || "parchment",
        [x, y],
      ),
    ).toBe("parchment");

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 8, y + 5, { steps: 3 });
    await page.mouse.up();
    await expect(page.locator(".turning-moon")).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("incant-drawing-v2") || "[]")
              .length,
        ),
      )
      .toBe(1);
    const inked = await canvas.evaluate((node: HTMLCanvasElement) =>
      node.toDataURL(),
    );

    const moon = page.getByRole("button", {
      name: "New spell — turn the moon",
    });
    await expect(moon).toBeVisible();
    await moon.click();
    await expect(page.locator(".turning-moon")).toHaveCount(1);
    await expect(page.locator(".moon-orbit")).toHaveCSS(
      "animation-name",
      "moon-turn",
    );
    await expect
      .poll(
        async () =>
          (await canvas.evaluate((node: HTMLCanvasElement) =>
            node.toDataURL(),
          )) !== inked,
      )
      .toBe(true);
  });
}
