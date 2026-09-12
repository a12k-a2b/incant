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
    localStorage.setItem(
      "incant-grimoire-v1",
      JSON.stringify({ owlMode: "tray" }),
    );
    (window as any).cancelOwl = true;
    (window as any).holdOwl = false;
    (window as any).owlTrayShareCalls = 0;
    (window as any).hoots = 0;
    const original = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      (window as any).hoots++;
      return original.call(this);
    };
    Object.defineProperty(navigator, "canShare", { value: () => true });
    Object.defineProperty(navigator, "share", {
      value: async (data: ShareData) => {
        (window as any).owlTrayShareCalls++;
        const held = (window as any).holdOwl;
        (window as any).owlShare = {
          url: data.url,
          files: data.files?.length,
          active: navigator.userActivation.isActive,
        };
        if (held)
          await new Promise<void>((resolve) => {
            (window as any).releaseOwlTrayShare = resolve;
          });
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
  expect(rows).toHaveLength(0);
  await page.getByRole("button", { name: "Owl post", exact: true }).click();
  expect(rows).toHaveLength(0);
  await page.getByRole("button", { name: "Prepare reply link" }).click();
  await expect(
    page.getByRole("button", { name: "Choose where to send" }),
  ).toBeEnabled();
  expect(rows).toHaveLength(1);
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
  await expect.poll(() => handoffs).toBe(1);
  await expect(
    page.getByRole("button", { name: "Choose where to send" }),
  ).toBeEnabled();
  expect(await page.evaluate(() => (window as any).owlShare)).toMatchObject({
    files: 2,
    active: true,
  });
  expect(await page.evaluate(() => (window as any).owlShare.url)).toContain(
    "/#owl=",
  );
  await page.evaluate(() => ((window as any).holdOwl = true));
  await page
    .getByRole("button", { name: "Choose where to send" })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect
    .poll(() => page.evaluate(() => (window as any).owlTrayShareCalls))
    .toBe(3);
  expect(handoffs).toBe(1);
  await page.evaluate(() => (window as any).releaseOwlTrayShare());
  await expect.poll(() => handoffs).toBe(2);
  await expect(
    page.getByRole("button", { name: "Choose where to send" }),
  ).toBeEnabled();
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
  await page.getByLabel("Choose an image").setInputFiles({
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
for (const outage of [
  { status: 503, error: "Synthetic cloud outage" },
  { status: 429, error: "Synthetic daily quota exhausted" },
]) {
  test(`painted owl shares exact local parcel without cloud at ${outage.status}`, async ({
    page,
  }) => {
    let cloudPosts = 0;
    await page.route("**/api/owl", async (r) => {
      if (r.request().method() === "POST") cloudPosts++;
      await r.fulfill({ status: outage.status, json: { error: outage.error } });
    });
    await page.addInitScript(() => {
      localStorage.setItem("incant-introduction-v1", "seen");
      (window as any).owlShareMode = "cancel";
      (window as any).owlShareCalls = 0;
      Object.defineProperty(navigator, "canShare", { value: () => true });
      Object.defineProperty(navigator, "share", {
        value: async (d: ShareData) => {
          (window as any).owlShareCalls++;
          const mode = (window as any).owlShareMode;
          const active = navigator.userActivation.isActive;
          const contents = await Promise.all(
            (d.files || []).map(
              (file) =>
                new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(String(reader.result));
                  reader.onerror = reject;
                  reader.readAsDataURL(file);
                }),
            ),
          );
          (window as any).parcelShare = {
            text: d.text,
            title: d.title,
            url: d.url,
            files: d.files?.map((f) => f.name),
            contents,
            active,
          };
          if (mode === "hold")
            await new Promise<void>((resolve) => {
              (window as any).releaseOwlShare = resolve;
            });
          if (mode === "cancel")
            throw new DOMException("cancelled", "AbortError");
          if (mode === "error") throw new Error("Synthetic share failure");
        },
      });
    });
    await page.goto("/");
    const c = page.locator("canvas"),
      b = (await c.boundingBox())!;
    await page.mouse.move(b.x + b.width * 0.4, b.y + b.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.4);
    await page.mouse.up();
    const original = await c.evaluate((canvas: HTMLCanvasElement) =>
      canvas.toDataURL(),
    );
    await page.route("**/api/cast", (r) =>
      r.fulfill({ json: { ok: true, imageBase64: tiny } }),
    );
    await page
      .getByRole("button", { name: "Type a spell", exact: true })
      .click();
    await page
      .getByLabel("Type your spell", { exact: true })
      .fill("A winter cottage");
    await page.getByRole("button", { name: "Cast typed spell" }).click();
    await expect(
      page.getByRole("button", { name: "Compare original sketch" }),
    ).toBeVisible({ timeout: 8000 });
    expect(cloudPosts).toBe(0);

    await page.getByRole("button", { name: "Owl post", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => (window as any).parcelShare))
      .toMatchObject({
        active: true,
        files: ["incant-image.png", "incant-original-sketch.png"],
        title: "A small act of sorcery",
        url: undefined,
      });
    let shared = await page.evaluate(() => (window as any).parcelShare);
    expect(shared.text).toContain("A winter cottage");
    expect(shared.contents).toEqual([
      `data:image/png;base64,${tiny}`,
      original,
    ]);
    expect(cloudPosts).toBe(0);
    await expect(
      page.getByRole("dialog", { name: "Owl post" }),
    ).not.toBeVisible();
    await expect
      .poll(() => page.evaluate(() => (window as any).owlShareCalls))
      .toBe(1);
    await page.waitForTimeout(50);

    await page.evaluate(() => ((window as any).owlShareMode = "success"));
    await page.getByRole("button", { name: "Owl post", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => (window as any).parcelShare))
      .toMatchObject({ active: true });
    await expect
      .poll(() => page.evaluate(() => (window as any).owlShareCalls))
      .toBe(2);
    await page.waitForTimeout(50);
    shared = await page.evaluate(() => (window as any).parcelShare);
    expect(shared.contents).toEqual([
      `data:image/png;base64,${tiny}`,
      original,
    ]);
    expect(cloudPosts).toBe(0);

    if (outage.status === 503) {
      await page.evaluate(() => {
        (window as any).owlShareMode = "hold";
        const owl = document.querySelector<HTMLButtonElement>(".owl-key")!;
        owl.click();
        owl.click();
      });
      await expect
        .poll(() => page.evaluate(() => (window as any).owlShareCalls))
        .toBe(3);
      await page.evaluate(() => (window as any).releaseOwlShare());

      await page.evaluate(() => ((window as any).owlShareMode = "error"));
      await page.getByRole("button", { name: "Owl post", exact: true }).click();
      await expect(page.getByRole("alert")).toHaveText(
        "Synthetic share failure",
      );
      expect(await page.evaluate(() => (window as any).owlShareCalls)).toBe(4);
      await page.getByRole("button", { name: "Close owl post" }).click();

      await page.evaluate(() => ((window as any).owlShareMode = "success"));
      await page.getByRole("button", { name: "Owl post", exact: true }).click();
      await expect
        .poll(() => page.evaluate(() => (window as any).owlShareCalls))
        .toBe(5);
    }
  });
}

test("a delayed reply-link preparation cannot attach old files or spell to a new active cast", async ({
  page,
}) => {
  let releasePreparation!: () => void;
  const preparationGate = new Promise<void>((resolve) => {
    releasePreparation = resolve;
  });
  let preparedBody: any;
  await page.route("**/api/owl", async (r) => {
    if (r.request().method() === "GET") return r.fulfill({ json: [] });
    preparedBody = r.request().postDataJSON();
    await preparationGate;
    await r.fulfill({
      json: {
        id: preparedBody.id,
        token: preparedBody.id + "." + "c".repeat(64),
        created: Date.now(),
        expires: Date.now() + 86400000,
        revoked: false,
        replies: [],
      },
    });
  });
  await page.addInitScript(() => {
    localStorage.setItem("incant-introduction-v1", "seen");
    localStorage.setItem(
      "incant-grimoire-v1",
      JSON.stringify({ owlMode: "tray" }),
    );
    Object.defineProperty(navigator, "canShare", { value: () => true });
    Object.defineProperty(navigator, "share", {
      value: async (d: ShareData) => {
        const contents = await Promise.all(
          (d.files || []).map(
            (file) =>
              new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result));
                reader.onerror = reject;
                reader.readAsDataURL(file);
              }),
          ),
        );
        (window as any).identityShare = {
          text: d.text,
          url: d.url,
          contents,
          active: navigator.userActivation.isActive,
        };
      },
    });
  });
  await page.goto("/");
  const canvas = page.locator("canvas");
  let box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.4);
  await page.mouse.up();
  const firstSketch = await canvas.evaluate((c: HTMLCanvasElement) =>
    c.toDataURL(),
  );
  const [firstPreparedImage, firstPreparedSketch] = await page.evaluate(
    async ({ rendered, sketch }) => {
      return Promise.all(
        [rendered, sketch].map(async (data) => {
          const bitmap = await createImageBitmap(
            await (await fetch(data)).blob(),
          );
          try {
            const scale = Math.min(
              1,
              1536 / Math.max(bitmap.width, bitmap.height),
            );
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(bitmap.width * scale));
            canvas.height = Math.max(1, Math.round(bitmap.height * scale));
            const context = canvas.getContext("2d")!;
            context.fillStyle = "#fff";
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL("image/png");
          } finally {
            bitmap.close();
          }
        }),
      );
    },
    { rendered: `data:image/png;base64,${tiny}`, sketch: firstSketch },
  );
  let castImage = tiny;
  await page.route("**/api/cast", (r) =>
    r.fulfill({ json: { ok: true, imageBase64: castImage } }),
  );
  await page.getByRole("button", { name: "Type a spell", exact: true }).click();
  await page.getByLabel("Type your spell", { exact: true }).fill("First spell");
  await page.getByRole("button", { name: "Cast typed spell" }).click();
  await expect(
    page.getByRole("button", { name: "Compare original sketch" }),
  ).toBeVisible({ timeout: 8000 });
  await page.getByRole("button", { name: "Owl post", exact: true }).click();
  await page.getByRole("button", { name: "Prepare reply link" }).click();
  await expect.poll(() => preparedBody?.spell).toBe("First spell");
  await page.getByRole("button", { name: "Close owl post" }).click();
  await page.getByRole("button", { name: "New spell — turn the moon" }).click();
  await page.waitForTimeout(1300);
  releasePreparation();

  await expect(
    page.getByRole("button", { name: "Type a spell", exact: true }),
  ).toBeEnabled({ timeout: 5000 });
  box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.35);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.65);
  await page.mouse.up();
  const secondSketch = await canvas.evaluate((c: HTMLCanvasElement) =>
    c.toDataURL(),
  );
  castImage = secondSketch.split(",")[1];
  await page.getByRole("button", { name: "Type a spell", exact: true }).click();
  await page
    .getByLabel("Type your spell", { exact: true })
    .fill("Second spell");
  await page.getByRole("button", { name: "Cast typed spell" }).click();
  await expect(
    page.getByRole("button", { name: "Compare original sketch" }),
  ).toBeVisible({ timeout: 8000 });
  await page.getByRole("button", { name: "Owl post", exact: true }).click();
  await expect(page.getByRole("button", { name: "Copy link" })).toHaveCount(0);
  await page.getByRole("button", { name: "Choose where to send" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).identityShare))
    .toMatchObject({ active: true, url: undefined });
  const shared = await page.evaluate(() => (window as any).identityShare);
  expect(shared.text).toContain("Second spell");
  expect(shared.contents).toEqual([secondSketch, secondSketch]);
  expect(preparedBody.spell).toBe("First spell");
  expect(preparedBody.image).toBe(firstPreparedImage);
  expect(preparedBody.sketch).toBe(firstPreparedSketch);
});
