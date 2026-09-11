import { test, expect } from "@playwright/test";
test("first visit is skippable, stays dismissed across reload, and help replays it", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/gemini-token", (r) => {
    requests++;
    return r.abort();
  });
  await page.route("**/api/cast", (r) => {
    requests++;
    return r.abort();
  });
  await page.goto("/");
  const guide = page.getByRole("dialog", { name: "A little guide to Incant" });
  await expect(guide).toBeVisible();
  await expect(guide.getByRole("heading")).toHaveText("Begin with a scribble.");
  await guide.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(guide).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Show introduction" }),
  ).toBeVisible();
  await expect(guide).toHaveCount(0);
  await page.getByRole("button", { name: "Show introduction" }).click();
  await expect(guide).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(guide).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Show introduction" }),
  ).toBeFocused();
  expect(requests).toBe(0);
});
test("four pages support back and completion without modifying the sketch", async ({
  page,
}) => {
  await page.goto("/");
  const guide = page.getByRole("dialog", { name: "A little guide to Incant" });
  await guide.getByRole("button", { name: "Skip", exact: true }).click();
  const c = page.locator("canvas"),
    b = (await c.boundingBox())!;
  await page.mouse.move(b.x + b.width * 0.4, b.y + b.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.6);
  await page.mouse.up();
  const before = await c.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.getByRole("button", { name: "Show introduction" }).click();
  await guide.getByRole("button", { name: "Next" }).click();
  await expect(guide.getByRole("heading")).toHaveText(
    "Give your drawing a spell.",
  );
  await guide.getByRole("button", { name: "Back", exact: true }).click();
  await expect(guide.getByRole("heading")).toHaveText("Begin with a scribble.");
  for (let i = 0; i < 3; i++)
    await guide.getByRole("button", { name: "Next" }).click();
  await expect(guide.getByRole("heading")).toHaveText(
    "There is always another story.",
  );
  await guide.getByRole("button", { name: "Let’s make magic" }).click();
  await expect(guide).toHaveCount(0);
  expect(await c.evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(
    before,
  );
  await page.reload();
  await expect(guide).toHaveCount(0);
});
for (const [name, width, height] of [
  ["dc1-portrait", 1184, 1584],
  ["dc1-landscape", 1584, 1184],
  ["phone", 390, 844],
  ["short", 844, 390],
] as const) {
  test(`guide fits ${name} and remains usable with reduced motion`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const guide = page.getByRole("dialog", {
      name: "A little guide to Incant",
    });
    await expect(guide).toBeVisible();
    await expect(guide.getByRole("button", { name: "Next" })).toBeInViewport();
    await expect(page.locator(".lesson-ink")).toHaveCSS(
      "animation-name",
      "none",
    );
    await page.screenshot({
      path: `../docs/evidence/introduction-${name}.png`,
    });
    for (let i = 0; i < 3; i++)
      await guide.getByRole("button", { name: "Next" }).click();
    await expect(
      guide.getByRole("button", { name: "Skip", exact: true }),
    ).toBeInViewport();
    await expect(
      guide.getByRole("button", { name: "Let’s make magic" }),
    ).toBeInViewport();
    await guide.getByRole("button", { name: "Let’s make magic" }).click();
    const help = page.getByRole("button", { name: "Show introduction" });
    await expect(help).toBeInViewport();
    const box = (await help.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({
      path: `../docs/evidence/introduction-help-${name}.png`,
    });
  });
}
