import { test, expect } from "@playwright/test";
const tiny =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR4nGPYt7T2PwgzpATo/gdhAFwuCX92OUWiAAAAAElFTkSuQmCC";
test("owl sharing preserves activation, distinguishes cancellation, and announces an image reply once", async ({
  page,
  context,
}) => {
  const rows: any[] = [];
  let handoffs = 0;
  await context.route("**/api/owl", async (r) => {
    if (r.request().method() === "GET") return r.fulfill({ json: rows });
    const b = r.request().postDataJSON();
    const row = {
      id: b.id,
      token: b.id + "." + "a".repeat(64),
      created: Date.now(),
      expires: Date.now() + 86400000,
      revoked: false,
      replies: [],
    };
    rows.push(row);
    await r.fulfill({ json: row });
  });
  await context.route("**/api/owl/*/handoff", async (r) => {
    handoffs++;
    rows[0].handedOff = Date.now();
    await r.fulfill({ json: rows[0] });
  });
  await context.route("**/api/owl/*/replies/*", (r) =>
    r.fulfill({ contentType: "image/png", body: Buffer.from(tiny, "base64") }),
  );
  await page.addInitScript(() => {
    localStorage.setItem("incant-introduction-v1", "seen");
    (window as any).cancelOwl = true;
    (window as any).hoots = 0;
    const original = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      (window as any).hoots++;
      return original.call(this);
    };
    Object.defineProperty(navigator, "canShare", { value: () => true });
    Object.defineProperty(navigator, "share", {
      value: async (data: ShareData) => {
        (window as any).owlShare = {
          url: data.url,
          files: data.files?.length,
          active: navigator.userActivation.isActive,
        };
        if ((window as any).cancelOwl)
          throw new DOMException("cancelled", "AbortError");
      },
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Owl post", exact: true }),
  ).toBeVisible();
  const c = page.locator("canvas"),
    b = (await c.boundingBox())!;
  await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.4);
  await page.mouse.up();
  const source = await c.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.route("**/api/cast", (r) =>
    r.fulfill({ json: { ok: true, imageBase64: source.split(",")[1] } }),
  );
  await page.getByRole("button", { name: "Type a spell", exact: true }).click();
  await page
    .getByLabel("Type your spell", { exact: true })
    .fill("Synthetic owl fixture");
  await page.getByRole("button", { name: "Cast typed spell" }).click();
  await expect(
    page.getByRole("button", { name: "Compare original sketch" }),
  ).toBeVisible({ timeout: 8000 });
  await page.getByRole("button", { name: "Owl post", exact: true }).click();
  await page.getByRole("button", { name: "Choose where to send" }).click();
  await expect(page.getByRole("dialog", { name: "Owl post" })).toContainText(
    "Sharing cancelled",
  );
  expect(handoffs).toBe(0);
  await page.evaluate(() => ((window as any).cancelOwl = false));
  await page.getByRole("button", { name: "Choose where to send" }).click();
  await expect(page.getByRole("dialog", { name: "Owl post" })).toContainText(
    "Handed to your sharing app",
  );
  expect(handoffs).toBe(1);
  expect(await page.evaluate(() => (window as any).owlShare)).toMatchObject({
    files: 1,
    active: true,
  });
  expect(await page.evaluate(() => (window as any).owlShare.url)).toContain(
    "/#owl=",
  );
  await page.screenshot({ path: "../docs/evidence/owl-post-tray.png" });
  await page.getByRole("button", { name: "Close owl post" }).click();
  rows[0].opened = Date.now();
  rows[0].replies = [
    { id: "10000000-0000-4000-8000-000000000000", created: Date.now() },
  ];
  await expect(
    page.getByRole("button", { name: /Owl post, 2 new updates/ }),
  ).toBeVisible({ timeout: 12000 });
  await expect.poll(() => page.evaluate(() => (window as any).hoots)).toBe(2);
  await page.waitForTimeout(8500);
  expect(await page.evaluate(() => (window as any).hoots)).toBe(2);
  await page.getByRole("button", { name: /Owl post, 2 new updates/ }).click();
  await expect(page.getByRole("dialog", { name: "Owl post" })).toContainText(
    "Opened",
  );
  await expect(page.getByAltText(/Image reply received/)).toBeVisible();
});
test("recipient opens deliberately, sees no room gate, and retries the same reply safely", async ({
  page,
}) => {
  let opens = 0,
    replyAttempts = 0;
  const ids: string[] = [];
  await page.route("**/api/owl-public", (r) =>
    r.fulfill({ json: { expires: Date.now() + 86400000 } }),
  );
  await page.route("**/api/owl-public/open", (r) => {
    opens++;
    return r.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/owl-public/image", (r) =>
    r.fulfill({ contentType: "image/png", body: Buffer.from(tiny, "base64") }),
  );
  await page.route("**/api/owl-public/reply", (r) => {
    ids.push(r.request().postDataJSON().id);
    replyAttempts++;
    return r.fulfill({
      status: replyAttempts === 1 ? 503 : 201,
      json: replyAttempts === 1 ? { error: "Try again" } : { ok: true },
    });
  });
  await page.goto("/#owl=synthetic");
  await expect(page.getByRole("button", { name: "Open letter" })).toBeEnabled();
  expect(opens).toBe(0);
  await expect(page.getByLabel("Room passphrase")).toHaveCount(0);
  await page.getByRole("button", { name: "Open letter" }).click();
  expect(opens).toBe(1);
  await expect(
    page.getByAltText("Image sent to you through Incant"),
  ).toBeVisible();
  await page
    .getByLabel("Choose an image")
    .setInputFiles({
      name: "reply.png",
      mimeType: "image/png",
      buffer: Buffer.from(tiny, "base64"),
    });
  await page.getByRole("button", { name: "Send image reply" }).click();
  await expect(page.getByRole("alert")).toHaveText("Try again");
  await page.getByRole("button", { name: "Send image reply" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Your image reply is saved",
  );
  expect(ids[0]).toBe(ids[1]);
  await page.screenshot({ path: "../docs/evidence/owl-recipient.png" });
});
test("missing cloud storage is recoverable and never opens a share sheet", async ({
  page,
}) => {
  await page.route("**/api/owl", (r) =>
    r.fulfill({
      status: 503,
      json: { error: "Owl post needs cloud storage." },
    }),
  );
  await page.addInitScript(() =>
    localStorage.setItem("incant-introduction-v1", "seen"),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Owl post", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Owl post" })).toContainText(
    "Open a finished image",
  );
  await expect(
    page.getByRole("button", { name: "Choose where to send" }),
  ).toHaveCount(0);
});
