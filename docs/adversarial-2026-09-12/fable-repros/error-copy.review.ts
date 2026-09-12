import { test, expect } from "@playwright/test";
// R-04: raw browser exception text reaches the parchment for offline casts
// and microphone permission failures.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("incant-introduction-v1", "seen"),
  );
});
async function draw(page: any) {
  const c = page.locator("canvas"),
    r = (await c.boundingBox())!;
  await page.mouse.move(r.x + r.width * 0.3, r.y + r.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width * 0.6, r.y + r.height * 0.5);
  await page.mouse.up();
}
test("offline cast shows the browser's raw fetch error", async ({ page, context }) => {
  await page.goto("/");
  await draw(page);
  await page.route("**/api/cast", (r) => r.abort("internetdisconnected"));
  await page.getByRole("button", { name: "Type a spell", exact: true }).click();
  await page.getByLabel("Type your spell", { exact: true }).fill("A cottage");
  await page.getByRole("button", { name: "Cast typed spell" }).click();
  const alert = page.getByRole("alert");
  await expect(alert).toBeVisible();
  const text = await alert.innerText();
  console.log("offline cast alert:", JSON.stringify(text));
  expect(text).not.toMatch(/failed to fetch/i);
});
test("microphone denial shows the browser's raw permission text", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: () =>
        Promise.reject(
          new DOMException("Permission denied", "NotAllowedError"),
        ),
    });
  });
  await page.goto("/");
  await draw(page);
  const wand = page.locator(".voice-wand");
  const b = (await wand.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(400);
  await page.mouse.up();
  const alert = page.getByRole("alert");
  await expect(alert).toBeVisible();
  const text = await alert.innerText();
  console.log("mic denied alert:", JSON.stringify(text));
  expect(text).not.toMatch(/^permission denied$/i);
});
