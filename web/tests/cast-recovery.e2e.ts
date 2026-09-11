import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("incant-introduction-v1", "seen"),
  );
});
for (const success of [false, true])
  test(`immersive cast ${success ? "reveals and saves its image" : "shows a readable error and preserves the sketch"}`, async ({
    page,
  }) => {
    await page.goto("/");
    const canvas = page.locator("canvas"),
      b = (await canvas.boundingBox())!;
    await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.6);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.3);
    await page.mouse.up();
    const png = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route("**/api/cast", async (r) => {
      await gate;
      await r.fulfill({
        status: success ? 200 : 400,
        json: success
          ? { ok: true, imageBase64: png.split(",")[1] }
          : {
              ok: false,
              error:
                "The image service is temporarily unavailable. Your sketch is safe.",
            },
      });
    });
    await page
      .getByRole("button", { name: "Type a spell", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Type your spell", exact: true })
      .fill("A synthetic cottage");
    await page
      .getByRole("button", { name: "Cast typed spell", exact: true })
      .click();
    await expect(page.locator("main")).toHaveClass(/phase-casting/);
    await expect(page.locator(".spell-fog")).toBeVisible();
    await expect(page.locator(".spell-flight")).toBeVisible();
    release();
    if (success) {
      await expect(page.locator(".manifestation")).toHaveClass(/image-ready/);
      await expect(page.locator(".spell-fog")).toHaveCount(0, {
        timeout: 8000,
      });
      await page.reload();
      await page.getByRole("button", { name: "Open saved spells" }).click();
      await expect(
        page.getByRole("dialog", { name: "Your saved spells" }),
      ).toContainText("A synthetic cottage");
    } else {
      const alert = page.getByRole("alert");
      await expect(alert).toContainText("Your sketch is safe");
      await expect(alert).toHaveCSS("clip-path", "none");
      expect((await alert.boundingBox())!.height).toBeGreaterThan(40);
      await expect(alert).toBeInViewport();
      expect(
        await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL()),
      ).toBe(png);
      await page.getByRole("button", { name: "Dismiss message" }).click();
      await expect(alert).toHaveCount(0);
      await page
        .getByRole("button", { name: "Type a spell", exact: true })
        .click();
      await expect(
        page.getByRole("textbox", { name: "Type your spell", exact: true }),
      ).toHaveValue("A synthetic cottage");
    }
  });
