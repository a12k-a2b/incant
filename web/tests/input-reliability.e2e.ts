import { expect, test, type Page } from "@playwright/test";

test.use({ hasTouch: true });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("incant-introduction-v1", "seen"),
  );
});

async function installSyntheticDictation(
  page: Page,
  transcript = "Semantic silver dragon",
) {
  await page.addInitScript((spoken) => {
    const context = new AudioContext();
    const destination = context.createMediaStreamDestination();
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => destination.stream,
    });
    class FakeSocket {
      static OPEN = 1;
      readyState = 1;
      binaryType = "";
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror = null;
      constructor() {
        setTimeout(() => this.onopen?.(), 5);
      }
      send(raw: string) {
        const message = JSON.parse(raw);
        if (message.setup)
          setTimeout(
            () =>
              this.onmessage?.({
                data: JSON.stringify({ setupComplete: {} }),
              }),
            5,
          );
        if (message.realtimeInput?.activityEnd)
          setTimeout(
            () =>
              this.onmessage?.({
                data: JSON.stringify({
                  serverContent: {
                    inputTranscription: { text: spoken },
                    turnComplete: true,
                  },
                }),
              }),
            10,
          );
      }
      close() {
        this.readyState = 3;
        this.onclose?.();
      }
    }
    Object.defineProperty(window, "WebSocket", { value: FakeSocket });
  }, transcript);
  await page.route("**/api/gemini-token", (route) =>
    route.fulfill({ json: { token: "synthetic-token" } }),
  );
}

async function drawOneStroke(page: Page) {
  await expect(
    page.getByRole("button", { name: "Dragon settings" }),
  ).toBeEnabled();
  const canvas = page.locator("canvas");
  const before = await canvas.evaluate((node: HTMLCanvasElement) =>
    node.toDataURL(),
  );
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.55);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4);
  await page.mouse.up();
  await expect
    .poll(() => canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL()))
    .not.toBe(before);
}

test("pen contact rejects a simultaneous palm moon tap and preserves the unfinished stroke", async ({
  page,
}) => {
  await page.goto("/");
  const canvas = page.locator("canvas");
  const canvasBox = (await canvas.boundingBox())!;
  const moonBox = (await page
    .getByRole("button", { name: "New spell — turn the moon" })
    .boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const x = canvasBox.x + canvasBox.width * 0.5;
  const y = canvasBox.y + canvasBox.height * 0.5;
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    buttons: 1,
    pointerType: "pen",
    force: 0.5,
  });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: x + 60,
    y: y - 60,
    button: "left",
    buttons: 1,
    pointerType: "pen",
    force: 0.5,
  });
  const wand = page.locator(".voice-wand");
  await wand.dispatchEvent("pointerdown", {
    pointerType: "touch",
    pointerId: 91,
    button: 0,
    buttons: 1,
    isPrimary: false,
  });
  await wand.dispatchEvent("pointerup", {
    pointerType: "touch",
    pointerId: 91,
    button: 0,
    buttons: 0,
    isPrimary: false,
  });
  await expect(page.locator("main")).toHaveClass(/phase-idle/);
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: x + 90,
    y: y - 30,
    button: "left",
    buttons: 1,
    pointerType: "pen",
    force: 0.5,
  });
  await page.touchscreen.tap(
    moonBox.x + moonBox.width * 0.5,
    moonBox.y + moonBox.height * 0.5,
  );
  await expect(page.locator("main")).not.toHaveClass(/turning-moon/);
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: x + 90,
    y: y - 30,
    button: "left",
    buttons: 0,
    pointerType: "pen",
  });
  await page.touchscreen.tap(
    moonBox.x + moonBox.width * 0.5,
    moonBox.y + moonBox.height * 0.5,
  );
  await expect(page.locator("main")).not.toHaveClass(/turning-moon/);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("incant-drawing-v2") || "[]")[0]
            ?.points.length ?? 0,
      ),
    )
    .toBeGreaterThan(2);
  expect(
    await page.evaluate(async () => {
      // Vite serves this browser-only root import during the E2E run.
      // @ts-expect-error browser module path is outside TypeScript resolution
      const { allPairs } = await import("/src/lib/archive.ts");
      return (await allPairs()).length;
    }),
  ).toBe(0);

  // Negative control: an ordinary finger tap remains a working moon control
  // once the short release guard has elapsed.
  await page.waitForTimeout(300);
  await page.touchscreen.tap(
    moonBox.x + moonBox.width * 0.5,
    moonBox.y + moonBox.height * 0.5,
  );
  await expect(page.locator("main")).toHaveClass(/turning-moon/);
});

test("a destructive semantic page turn archives an in-progress pen stroke before clearing", async ({
  page,
}) => {
  await page.goto("/");
  const canvasBox = (await page.locator("canvas").boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const x = canvasBox.x + canvasBox.width * 0.4;
  const y = canvasBox.y + canvasBox.height * 0.55;
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    buttons: 1,
    pointerType: "pen",
    force: 0.5,
  });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: x + 90,
    y: y - 45,
    button: "left",
    buttons: 1,
    pointerType: "pen",
    force: 0.5,
  });
  await page
    .getByRole("button", { name: "New spell — turn the moon" })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator("main")).toHaveClass(/turning-moon/);
  expect(
    await page.evaluate(async () => {
      // Vite serves this browser-only root import during the E2E run.
      // @ts-expect-error browser module path is outside TypeScript resolution
      const { allPairs } = await import("/src/lib/archive.ts");
      const pairs = await allPairs();
      return { count: pairs.length, sealed: pairs[0]?.sealed };
    }),
  ).toEqual({ count: 1, sealed: true });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: x + 90,
    y: y - 45,
    button: "left",
    buttons: 0,
    pointerType: "pen",
  });
});

test("window blur clears stale pen-contact rejection so a later finger wand tap works", async ({
  page,
}) => {
  await installSyntheticDictation(page);
  await page.goto("/");
  await drawOneStroke(page);
  const canvasBox = (await page.locator("canvas").boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: canvasBox.x + canvasBox.width * 0.45,
    y: canvasBox.y + canvasBox.height * 0.6,
    button: "left",
    buttons: 1,
    pointerType: "pen",
    force: 0.5,
  });
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  const wandBox = (await page.locator(".voice-wand").boundingBox())!;
  await page.touchscreen.tap(
    wandBox.x + wandBox.width / 2,
    wandBox.y + wandBox.height / 2,
  );
  await expect(
    page.getByRole("button", { name: /Listening… tap to cast/ }),
  ).toBeVisible();
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: canvasBox.x + canvasBox.width * 0.45,
    y: canvasBox.y + canvasBox.height * 0.6,
    button: "left",
    buttons: 0,
    pointerType: "pen",
  });
});

test("wand blur releases pointer ownership so the next gesture can start", async ({
  page,
}) => {
  await installSyntheticDictation(page);
  await page.goto("/");
  await drawOneStroke(page);
  const wand = page.locator(".voice-wand");
  await wand.hover();
  await page.mouse.down();
  await expect(page.locator("main")).toHaveClass(/phase-listening/);
  await wand.evaluate((button: HTMLButtonElement) => button.blur());
  await expect(page.locator("main")).toHaveClass(/phase-idle/);
  await page.mouse.up();
  await page.waitForTimeout(550);
  await wand.click();
  await expect(
    page.getByRole("button", { name: /Listening… tap to cast/ }),
  ).toBeVisible();
});

test("semantic wand click starts and stops once while pointer click does not double-activate", async ({
  page,
}) => {
  await installSyntheticDictation(page);
  let casts = 0;
  await page.route("**/api/cast", (route) => {
    casts++;
    return route.fulfill({
      status: 400,
      json: { ok: false, error: "Synthetic semantic cast verified" },
    });
  });
  await page.goto("/");
  await drawOneStroke(page);
  const wand = page.locator(".voice-wand");

  await wand.evaluate((button: HTMLButtonElement) => button.click());
  await expect(
    page.getByRole("button", { name: /Listening… tap to cast/ }),
  ).toBeVisible();
  await wand.evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByRole("alert")).toContainText(
    "Synthetic semantic cast verified",
  );
  expect(casts).toBe(1);
  await expect(page.locator("main")).toHaveClass(/phase-idle/);

  await wand.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: /Listening… tap to cast/ }),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect.poll(() => casts).toBe(2);

  // Negative control: a normal pointer tap already has down/up handling and
  // its generated click must not immediately stop the new session.
  await wand.click();
  await expect(
    page.getByRole("button", { name: /Listening… tap to cast/ }),
  ).toBeVisible();
  await page.waitForTimeout(100);
  expect(casts).toBe(2);
  await wand.click();
  await expect.poll(() => casts).toBe(3);

  const beforeHold = casts;
  const box = (await wand.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.locator("main")).toHaveClass(/phase-listening/);
  await page.waitForTimeout(750);
  await page.mouse.up();
  await expect.poll(() => casts).toBe(beforeHold + 1);
  await page.waitForTimeout(200);
  await expect(page.locator("main")).toHaveClass(/phase-idle/);
  expect(casts).toBe(beforeHold + 1);
});

test("a second hands-free tap while connecting is labeled and queued as finish", async ({
  page,
}) => {
  await installSyntheticDictation(page);
  await page.unroute("**/api/gemini-token");
  let releaseToken!: () => void;
  const tokenGate = new Promise<void>((resolve) => (releaseToken = resolve));
  await page.route("**/api/gemini-token", async (route) => {
    await tokenGate;
    await route.fulfill({ json: { token: "synthetic-token" } });
  });
  let casts = 0;
  await page.route("**/api/cast", (route) => {
    casts++;
    return route.fulfill({
      status: 400,
      json: { ok: false, error: "Synthetic queued finish verified" },
    });
  });
  await page.goto("/");
  await drawOneStroke(page);
  const wand = page.locator(".voice-wand");
  await wand.evaluate((button: HTMLButtonElement) => button.click());
  await expect(
    page.getByRole("button", { name: "Connecting… tap to finish" }),
  ).toBeVisible();
  await wand.evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator(".room-message")).toContainText(
    "Gathering your voice while the wand connects",
  );
  releaseToken();
  await expect.poll(() => casts).toBe(1);
  await page.waitForTimeout(150);
  expect(casts).toBe(1);
});

test("silent dictation keeps the user's existing typed spell", async ({
  page,
}) => {
  await installSyntheticDictation(page, "");
  await page.goto("/");
  await drawOneStroke(page);
  const typed = "A carefully typed lighthouse at dusk";
  await page.getByRole("button", { name: "Type a spell", exact: true }).click();
  await page.getByLabel("Type your spell", { exact: true }).fill(typed);
  await page.getByRole("button", { name: "Close typed spell" }).click();

  const wand = page.locator(".voice-wand");
  const box = (await wand.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.locator("main")).toHaveClass(/phase-listening/);
  await page.waitForTimeout(550);
  await page.mouse.up();
  await expect(page.locator("main")).toHaveClass(/phase-idle/);
  await page.getByRole("button", { name: "Type a spell", exact: true }).click();
  await expect(page.getByLabel("Type your spell", { exact: true })).toHaveValue(
    typed,
  );
  expect(
    await page.evaluate(() => localStorage.getItem("incant-spell-v2")),
  ).toBe(typed);
});

test("microphone denial gives an actionable typed-spell fallback", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        throw new DOMException("Permission denied", "NotAllowedError");
      },
    });
  });
  await page.goto("/");
  await drawOneStroke(page);
  await page
    .locator(".voice-wand")
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByRole("alert")).toContainText(
    "Microphone access was denied. Allow microphone access, or type your spell.",
  );
});

test("voice network failure gives a plain connection recovery message", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const context = new AudioContext();
    const destination = context.createMediaStreamDestination();
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => destination.stream,
    });
  });
  await page.route("**/api/gemini-token", (route) =>
    route.abort("internetdisconnected"),
  );
  await page.goto("/");
  await drawOneStroke(page);
  await page
    .locator(".voice-wand")
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByRole("alert")).toContainText(
    "The wand could not reach the voice service. Check your connection, or type your spell.",
  );
});

test("voice cancellation restores an opened generation and typed recast works over a blank current page", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: () => new Promise(() => {}),
    });
  });
  let casts = 0;
  let image = "";
  await page.route("**/api/cast", (route) => {
    casts++;
    return route.fulfill({
      json: {
        ok: true,
        imageBase64: image.slice(image.indexOf(",") + 1),
        mime: "image/png",
      },
    });
  });
  await page.goto("/");
  await drawOneStroke(page);
  image = await page
    .locator("canvas")
    .evaluate((node: HTMLCanvasElement) => node.toDataURL());
  await page.getByRole("button", { name: "Type a spell", exact: true }).click();
  await page.getByLabel("Type your spell", { exact: true }).fill("Old tower");
  await page.getByRole("button", { name: "Cast typed spell" }).click();
  await expect(page.locator(".manifestation.image-ready")).toBeVisible();
  await page.getByRole("button", { name: "New spell — turn the moon" }).click();
  await expect(page.locator("main")).toHaveClass(/phase-renewing/);
  await expect(page.locator(".voice-wand")).toBeDisabled();
  await expect(page.locator(".turning-moon")).toBeVisible();
  await expect(page.locator(".turning-moon")).toHaveCount(0, { timeout: 6000 });
  const blank = await page
    .locator("canvas")
    .evaluate((node: HTMLCanvasElement) => node.toDataURL());
  await page.getByRole("button", { name: "Open saved spells" }).click();
  await page.getByRole("button", { name: "Open image: Old tower" }).click();
  const openedSrc = await page.locator(".manifestation").getAttribute("src");

  const wand = page.locator(".voice-wand");
  await wand.evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator("main")).toHaveClass(/phase-connecting/);
  await wand.focus();
  await page.keyboard.press("Escape");
  await expect(page.locator("main")).toHaveClass(/phase-idle/);
  await expect(page.locator(".manifestation")).toHaveAttribute(
    "src",
    openedSrc!,
  );
  expect(
    await page
      .locator("canvas")
      .evaluate((node: HTMLCanvasElement) => node.toDataURL()),
  ).toBe(blank);

  await page.getByRole("button", { name: "Type a spell", exact: true }).click();
  await page
    .getByLabel("Type your spell", { exact: true })
    .fill("Old tower in winter");
  await expect(
    page.getByRole("button", { name: "Cast typed spell" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Cast typed spell" }).click();
  await expect.poll(() => casts).toBe(2);
  await expect(page.locator(".manifestation.image-ready")).toBeVisible();
  expect(
    await page
      .locator("canvas")
      .evaluate((node: HTMLCanvasElement) => node.toDataURL()),
  ).toBe(blank);
});

test("dragon drawing controls return to the current draft and perform undo and redo", async ({
  page,
}) => {
  await page.goto("/");
  const canvas = page.locator("canvas");
  const blank = await canvas.evaluate((node: HTMLCanvasElement) =>
    node.toDataURL(),
  );
  await drawOneStroke(page);
  const ink = await canvas.evaluate((node: HTMLCanvasElement) =>
    node.toDataURL(),
  );
  await page.route("**/api/cast", (route) =>
    route.fulfill({
      json: {
        ok: true,
        imageBase64: ink.slice(ink.indexOf(",") + 1),
        mime: "image/png",
      },
    }),
  );
  await page.getByRole("button", { name: "Type a spell", exact: true }).click();
  await page.getByLabel("Type your spell", { exact: true }).fill("Test image");
  await page.getByRole("button", { name: "Cast typed spell" }).click();
  await expect(page.locator(".manifestation.image-ready")).toBeVisible();

  await page.getByRole("button", { name: "Dragon settings" }).click();
  await page.getByRole("button", { name: "Return to my drawing" }).click();
  await expect(page.locator(".manifestation")).toHaveCount(0);
  expect(
    await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL()),
  ).toBe(ink);

  await page.getByRole("button", { name: "Dragon settings" }).click();
  await page.getByRole("button", { name: "Undo ink" }).click();
  expect(
    await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL()),
  ).toBe(blank);
  await page.getByRole("button", { name: "Dragon settings" }).click();
  await page.getByRole("button", { name: "Redo ink" }).click();
  expect(
    await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL()),
  ).toBe(ink);
});
