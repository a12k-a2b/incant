import { test, expect } from "@playwright/test";
async function result(page: any) {
  await page.goto("/");
  const r = await page.locator("canvas").boundingBox();
  await page.mouse.move(r.x + r.width * 0.3, r.y + r.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width * 0.6, r.y + r.height * 0.5);
  await page.mouse.up();
  const source = await page
    .locator("canvas")
    .evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.route("**/api/cast", (r: any) =>
    r.fulfill({
      json: { ok: true, imageBase64: source.split(",")[1], mime: "image/png" },
    }),
  );
  await page.getByRole("button", { name: "Type a spell", exact: true }).click();
  await page.getByLabel("Type your spell").fill("A synthetic spell");
  await page.getByRole("button", { name: "Cast typed spell" }).click();
  await expect(
    page.getByRole("button", { name: "Compare original sketch" }),
  ).toBeVisible({ timeout: 8000 });
  return source;
}
test("peel compares exact saved source without changing drawing or result", async ({
  page,
}) => {
  const source = await result(page);
  const original = await page.locator(".manifestation").getAttribute("src");
  const peel = page.getByRole("button", { name: "Compare original sketch" });
  await peel.click();
  await expect(peel).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".comparison-sketch")).toHaveAttribute(
    "src",
    source,
  );
  await expect(page.locator(".comparison-sketch")).toHaveCSS(
    "clip-path",
    "polygon(100% 100%, 100% -100%, -100% 100%)",
  );
  await peel.click();
  await expect(peel).toHaveAttribute("aria-pressed", "false");
  const b = (await peel.boundingBox())!;
  await page.mouse.move(b.x + 30, b.y + 30);
  await page.mouse.down();
  await page.mouse.move(b.x - 140, b.y - 140, { steps: 10 });
  await page.mouse.up();
  await expect(peel).toHaveAttribute("aria-pressed", "true");
  expect(await page.locator(".manifestation").getAttribute("src")).toBe(
    original,
  );
  expect(
    await page
      .locator("canvas")
      .evaluate((c: HTMLCanvasElement) => c.toDataURL()),
  ).toBe(source);
});
test("illustrated books expose saved creations and share exact image bytes", async ({
  page,
}) => {
  const source = await result(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (d: any) => {
        (window as any).shared = {
          name: d.files[0].name,
          type: d.files[0].type,
          bytes: Array.from(new Uint8Array(await d.files[0].arrayBuffer())),
        };
      },
    });
  });
  await page.getByRole("button", { name: "Open saved spells" }).click();
  await expect(
    page.getByRole("dialog", { name: "Your saved spells" }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Share image: A synthetic spell",
      exact: true,
    })
    .click();
  await expect
    .poll(() => page.evaluate(() => (window as any).shared?.type))
    .toBe("image/png");
  expect(await page.evaluate(() => (window as any).shared.bytes)).toEqual([
    ...Buffer.from(source.split(",")[1], "base64"),
  ]);
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Save image: A synthetic spell", exact: true })
    .click();
  expect((await download).suggestedFilename()).toMatch(/^sketch-magic-.*\.png$/);
});
test("hourglass cancels late image and respects reduced motion", async ({
  page,
}) => {
  await result(page);
  await page.getByRole("button", { name: "Type a spell", exact: true }).click();
  await page.route("**/api/cast", async (r) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await r
      .fulfill({ json: { ok: true, imageBase64: "AA==", mime: "image/png" } })
      .catch(() => {});
  });
  await page.getByRole("button", { name: "Cast typed spell" }).click();
  const hourglass = page.getByRole("button", {
    name: "Stop casting spell",
    exact: true,
  });
  await expect(hourglass).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(hourglass.locator("svg")).toHaveCSS("animation-name", "none");
  await hourglass.click();
  await expect(hourglass).toHaveCount(0);
  await page.waitForTimeout(1200);
  await expect(page.locator(".phase-casting")).toHaveCount(0);
  await expect(page.locator(".spell-fog")).toHaveCount(0);
});

// These existing flows exercise a returning user; first-visit behavior has its own suite.
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem("incant-introduction-v1", "seen")); });
