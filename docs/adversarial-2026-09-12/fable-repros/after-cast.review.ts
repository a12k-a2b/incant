import { test, expect } from "@playwright/test";
// R-05: after a successful cast in the immersive room, is there any
// non-destructive way back to an editable parchment? Also: is there any undo?
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("incant-introduction-v1", "seen"),
  );
});
test("result locks and hides the canvas; only voice, moon or a new cast release it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1184, height: 1584 });
  await page.goto("/");
  const canvas = page.locator("canvas"),
    r = (await canvas.boundingBox())!;
  await page.mouse.move(r.x + r.width * 0.3, r.y + r.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width * 0.6, r.y + r.height * 0.5);
  await page.mouse.up();
  const png = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.route("**/api/cast", (r) =>
    r.fulfill({ json: { ok: true, imageBase64: png.split(",")[1] } }),
  );
  await page.getByRole("button", { name: "Type a spell", exact: true }).click();
  await page.getByLabel("Type your spell", { exact: true }).fill("A cottage");
  await page.getByRole("button", { name: "Cast typed spell" }).click();
  await expect(page.locator(".manifestation.image-ready")).toBeVisible();
  await expect(page.locator(".spell-fog")).toHaveCount(0, { timeout: 8000 });
  const visibility = await canvas.evaluate((c) => getComputedStyle(c).visibility);
  const buttons = await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .filter((b) => {
        const s = getComputedStyle(b);
        return s.display !== "none" && s.visibility !== "hidden" && !b.closest("dialog");
      })
      .map((b) => b.getAttribute("aria-label") || b.textContent?.trim()),
  );
  console.log("canvas visibility with result:", visibility);
  console.log("visible room controls with a result:", JSON.stringify(buttons));
  // Try to draw: the canvas is locked while a result is active.
  await page.mouse.move(r.x + r.width * 0.2, r.y + r.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width * 0.4, r.y + r.height * 0.2);
  await page.mouse.up();
  const strokes = await page.evaluate(
    () => JSON.parse(localStorage.getItem("incant-drawing-v2") || "[]").length,
  );
  console.log("strokes after trying to draw over a result:", strokes);
  expect(visibility).toBe("hidden");
  expect(strokes).toBe(1);
  // Oracle: some visible control (not moon, not the voice wand) returns to the sketch.
  const nonDestructive = buttons.filter(
    (b) =>
      b &&
      !/moon|speak|Owl|Dragon|Type a spell|Show introduction|saved spells|Compare/i.test(
        b,
      ),
  );
  console.log("candidate back-to-sketch controls:", JSON.stringify(nonDestructive));
  expect(nonDestructive.length).toBeGreaterThan(0);
});
test("no undo exists in the immersive room (buttons, keys)", async ({ page }) => {
  await page.setViewportSize({ width: 1184, height: 1584 });
  await page.goto("/");
  const canvas = page.locator("canvas"),
    r = (await canvas.boundingBox())!;
  await page.mouse.move(r.x + r.width * 0.3, r.y + r.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width * 0.6, r.y + r.height * 0.5);
  await page.mouse.up();
  const labels = await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .filter((b) => getComputedStyle(b).display !== "none" && !b.closest("dialog"))
      .map((b) => b.getAttribute("aria-label") || b.textContent?.trim()),
  );
  console.log("room controls:", JSON.stringify(labels));
  await page.keyboard.press("ControlOrMeta+Z");
  await page.waitForTimeout(200);
  const strokes = await page.evaluate(
    () => JSON.parse(localStorage.getItem("incant-drawing-v2") || "[]").length,
  );
  console.log("strokes after Ctrl/Cmd+Z:", strokes);
  expect(labels.some((l) => /undo|eraser|quill/i.test(l || ""))).toBe(true);
});
