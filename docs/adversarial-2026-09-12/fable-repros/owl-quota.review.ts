import { test, expect } from "@playwright/test";
// R-08: in the default "Straight to sharing" mode every active result is
// uploaded to the owl post as a live letter before any share intent, and the
// server caps letters at 30/day and 1000 forever with no cleanup.
test("viewing results uploads owl letters without any share; reload re-uploads", async ({
  page,
}) => {
  const posts: any[] = [];
  await page.route("**/api/owl", async (r) => {
    if (r.request().method() === "GET") return r.fulfill({ json: [] });
    const b = r.request().postDataJSON();
    posts.push({ id: b.id, spell: b.spell, bytes: (b.image?.length || 0) + (b.sketch?.length || 0) });
    await r.fulfill({
      json: { id: b.id, token: b.id + "." + "c".repeat(64), created: Date.now(), expires: Date.now() + 86400000, revoked: false, replies: [] },
    });
  });
  await page.addInitScript(() => localStorage.setItem("incant-introduction-v1", "seen"));
  await page.goto("/");
  const c = page.locator("canvas"),
    b = (await c.boundingBox())!;
  await page.mouse.move(b.x + b.width * 0.4, b.y + b.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.4);
  await page.mouse.up();
  const png = await c.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.route("**/api/cast", (r) => r.fulfill({ json: { ok: true, imageBase64: png.split(",")[1] } }));
  for (const words of ["Hot", "Cold", "Wet"]) {
    await page.getByRole("button", { name: "Type a spell", exact: true }).click();
    await page.getByLabel("Type your spell", { exact: true }).fill(words);
    await page.getByRole("button", { name: "Cast typed spell" }).click();
    await expect(page.locator(".manifestation.image-ready")).toBeVisible();
    await expect(page.locator(".spell-fog")).toHaveCount(0, { timeout: 8000 });
  }
  await expect.poll(() => posts.length).toBe(3);
  console.log("letters created without touching the owl:", posts.length, JSON.stringify(posts.map((p) => p.spell)));
  // Reload and merely open one old image from the books.
  await page.reload();
  await page.getByRole("button", { name: "Open saved spells" }).click();
  await page.getByRole("button", { name: "Open image: Hot", exact: true }).click();
  await expect.poll(() => posts.length).toBe(4);
  console.log("after reload + opening one old image:", posts.length, "distinct ids:", new Set(posts.map((p) => p.id)).size);
  expect(new Set(posts.map((p) => p.id)).size).toBe(4);
});
