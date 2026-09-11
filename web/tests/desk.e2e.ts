import { test, expect, type Page } from "@playwright/test";
async function draw(page: Page) {
  const c = page.locator("canvas");
  const r = (await c.boundingBox())!;
  await page.mouse.move(r.x + r.width * 0.3, r.y + r.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width * 0.5, r.y + r.height * 0.3, {
    steps: 8,
  });
  await page.mouse.move(r.x + r.width * 0.7, r.y + r.height * 0.6, {
    steps: 8,
  });
  await page.mouse.up();
}
test("drawing, palm rejection, undo/redo, and reload persistence", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Cast spell", exact: true }),
  ).toBeDisabled();
  await page
    .locator("canvas")
    .dispatchEvent("pointerdown", { pointerType: "touch", pointerId: 9 });
  await page
    .locator("canvas")
    .dispatchEvent("pointerup", { pointerType: "touch", pointerId: 9 });
  await expect(page.getByText("Begin with a scribble")).toBeVisible();
  await draw(page);
  await expect(page.getByText("Begin with a scribble")).not.toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByText("Begin with a scribble")).toBeVisible();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page
    .getByLabel("THE INCANTATION", { exact: true })
    .fill("A storybook cottage");
  await page.reload();
  await expect(page.getByLabel("THE INCANTATION", { exact: true })).toHaveValue(
    "A storybook cottage",
  );
  await expect(page.getByText("Begin with a scribble")).not.toBeVisible();
});
test("failed cast recovers, uses current words, and never erases the sketch", async ({
  page,
}) => {
  await page.goto("/");
  await draw(page);
  await page
    .getByLabel("THE INCANTATION", { exact: true })
    .fill("A cottage in moonlight");
  let count = 0;
  await page.route("**/api/cast", async (r) => {
    count++;
    expect(r.request().postDataJSON().incantation).toBe(
      "A cottage in moonlight",
    );
    await r.abort("failed");
  });
  await page.getByRole("button", { name: "Cast spell", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cast spell", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Save sketch", exact: true }),
  ).toBeEnabled();
  expect(count).toBe(1);
});
test("successful image persists and original drawing remains recoverable", async ({
  page,
}) => {
  await page.goto("/");
  await draw(page);
  const png = await page
    .locator("canvas")
    .evaluate((c: HTMLCanvasElement) => c.toDataURL().split(",")[1]);
  await page.route("**/api/cast", (r) =>
    r.fulfill({ json: { ok: true, imageBase64: png, mime: "image/png" } }),
  );
  await page
    .getByLabel("THE INCANTATION", { exact: true })
    .fill("A synthetic cottage");
  await page.getByRole("button", { name: "Cast spell", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save image", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Saved manifestations" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to sketch", exact: true })
    .click();
  await expect(page.getByText("Begin with a scribble")).not.toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Open image: A synthetic cottage" }),
  ).toBeVisible();
  // A reopened historical result must reroll its own source, not a newer draft.
  await page
    .getByLabel("THE INCANTATION", { exact: true })
    .fill("Unrelated newer spell");
  await draw(page);
  let reroll: any;
  await page.route("**/api/cast", async (r) => {
    reroll = r.request().postDataJSON();
    await r.fulfill({
      json: { ok: true, imageBase64: png, mime: "image/png" },
    });
  });
  await page
    .getByRole("button", { name: "Open image: A synthetic cottage" })
    .click();
  await page.getByRole("button", { name: "Another", exact: true }).click();
  await expect.poll(() => reroll?.incantation).toBe("A synthetic cottage");
  expect(reroll.sketchPngBase64.replace(/^data:image\/png;base64,/, "")).toBe(
    png,
  );
});
test("cancellation prevents late results from replacing the desk", async ({
  page,
}) => {
  await page.goto("/");
  await draw(page);
  await page
    .getByLabel("THE INCANTATION", { exact: true })
    .fill("Cancel this spell");
  await page.route("**/api/cast", async (r) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await r
      .fulfill({ json: { ok: true, imageBase64: "late" } })
      .catch(() => {});
  });
  await page.getByRole("button", { name: "Cast spell", exact: true }).click();
  await page.getByRole("button", { name: "Stop waiting" }).click();
  await expect(
    page.getByRole("button", { name: "Cast spell", exact: true }),
  ).toBeEnabled();
  await page.waitForTimeout(1200);
  await expect(
    page.getByRole("button", { name: "Save image", exact: true }),
  ).not.toBeVisible();
});
for (const [name, width, height] of [
  ["desktop", 1440, 1000],
  ["dc1-portrait", 1200, 1600],
  ["dc1-landscape", 1600, 1200],
  ["tablet-portrait", 768, 1024],
  ["tablet-landscape", 1024, 768],
  ["phone", 390, 844],
] as const) {
  test(`layout ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.locator("canvas")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const r = (await page.locator("canvas").boundingBox())!;
    const native = await page
      .locator("canvas")
      .evaluate((c: HTMLCanvasElement) => c.width / c.height);
    expect(Math.abs(r.width / r.height - native)).toBeLessThan(0.01);
    expect((r.width * r.height) / (width * height)).toBeGreaterThan(0.5);
    const frame = (await page.locator(".drawing-area").boundingBox())!;
    expect((r.width * r.height) / (frame.width * frame.height)).toBeGreaterThan(
      0.68,
    );
    await page.screenshot({
      path: `../docs/evidence/${name}.png`,
      fullPage: true,
    });
  });
}
test("spellbook keyboard focus and honest setup", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Spellbook", exact: true }).click();
  await expect(page.locator("dialog[open]")).toBeVisible();
  await expect(
    page.getByText("A key is already on the canvas."),
  ).not.toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).not.toBeVisible();
});
for (const input of ["keyboard", "touch-hold", "tap"] as const) {
test(`voice ${input} uses final speech rather than the previous typed spell`, async ({
  page,
}) => {
  await page.addInitScript(() => {
    const context = new AudioContext(),
      dest = context.createMediaStreamDestination();
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => dest.stream,
    });
    class FakeSocket {
      static OPEN = 1;
      readyState = 1;
      binaryType = "";
      onopen: (() => void) | null = null;
      onmessage: ((e: { data: string }) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror = null;
      constructor() {
        setTimeout(() => this.onopen?.(), 5);
      }
      send(raw: string) {
        const m = JSON.parse(raw);
        if (m.setup)
          setTimeout(
            () =>
              this.onmessage?.({ data: JSON.stringify({ setupComplete: {} }) }),
            5,
          );
        if (m.realtimeInput?.activityEnd)
          setTimeout(
            () =>
              this.onmessage?.({
                data: JSON.stringify({
                  serverContent: {
                    inputTranscription: { text: "A final spoken dragon" },
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
  });
  await page.route("**/api/gemini-token", (r) =>
    r.fulfill({ json: { ok: true, token: "synthetic-token" } }),
  );
  let sent = "";
  await page.route("**/api/cast", (r) => {
    sent = r.request().postDataJSON().incantation;
    return r.fulfill({
      status: 400,
      json: {
        ok: false,
        error: "Synthetic stop after verifying spoken prompt",
      },
    });
  });
  await page.goto("/");
  await draw(page);
  await page
    .getByLabel("THE INCANTATION", { exact: true })
    .fill("An old typed cottage");
  const b = page.locator(".voice-wand");
  const session = input === "touch-hold" ? await page.context().newCDPSession(page) : null;
  const box = (await b.boundingBox())!;
  if (session) {
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
  } else if (input === "tap") {
    await b.click();
  } else {
    await b.focus();
    await page.keyboard.down("Space");
  }
  await expect(
    page.getByRole("button", { name: /Listening… (release|tap)/ }),
  ).toBeVisible();
  if (session) {
    await page.waitForTimeout(1200);
    expect(await b.evaluate(el => el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })))).toBe(false);
    await b.dispatchEvent("pointerup", { pointerId: 999, pointerType: "touch" });
    await expect(page.getByRole("button", { name: /Listening… release/ })).toBeVisible();
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("");
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else if (input === "tap") {
    await expect(page.getByRole("button", { name: /Listening… tap to cast/ })).toBeVisible();
    await page.getByLabel("THE WAND IS LISTENING", { exact: true }).click({ force: true });
    await expect(page.getByRole("button", { name: /Listening… tap to cast/ })).toBeVisible();
    await page.getByRole("button", { name: /Listening… tap to cast/ }).click();
  } else {
    await page.keyboard.up("Space");
  }
  await expect(page.getByRole("alert")).toContainText("Synthetic stop");
  expect(sent).toBe("A final spoken dragon");
});
}
test("early voice release discards a late microphone grant", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).__stopped = false;
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: () =>
        new Promise((r) =>
          setTimeout(
            () =>
              r({
                getTracks: () => [
                  {
                    stop: () => {
                      (window as any).__stopped = true;
                    },
                  },
                ],
              }),
            900,
          ),
        ),
    });
  });
  let tokens = 0;
  await page.route("**/api/gemini-token", (r) => {
    tokens++;
    return r.fulfill({ json: { ok: true, token: "synthetic" } });
  });
  await page.goto("/");
  await draw(page);
  const b = page.locator(".voice-wand");
  const box = (await b.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.waitForTimeout(350);
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => (window as any).__stopped))
    .toBe(true);
  expect(tokens).toBe(0);
  await expect(
    page.getByRole("button", { name: /[Hh]old to speak/ }),
  ).toBeEnabled();
});
test("resizing preserves the drawing's original proportions and pixels", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/");
  await draw(page);
  const before = await page
    .locator("canvas")
    .evaluate((c: HTMLCanvasElement) => ({
      png: c.toDataURL(),
      w: c.width,
      h: c.height,
    }));
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect
    .poll(async () => {
      const c = page.locator("canvas"),
        r = (await c.boundingBox())!;
      return Math.abs(r.width / r.height - before.w / before.h);
    })
    .toBeLessThan(0.01);
  const after = await page
    .locator("canvas")
    .evaluate((c: HTMLCanvasElement) => c.toDataURL());
  expect(after).toBe(before.png);
});

for (const mode of ["pen-button", "pen-bitmask", "toolbar"] as const) {
  test(`pixel eraser ${mode}: partial line, undo, redo, reload, and draw again`, async ({ page }) => {
    await page.goto("/");
    const canvas = page.locator("canvas");
    const r = (await canvas.boundingBox())!;
    const x = (f: number) => r.x + r.width * f;
    const y = (f: number) => r.y + r.height * f;
    const pixels = () => canvas.evaluate((c: HTMLCanvasElement) => {
      const ctx = c.getContext("2d")!;
      return [0.25, 0.5, 0.75].map(f =>
        ctx.getImageData(Math.floor(c.width * f), Math.floor(c.height * 0.5), 1, 1).data[0]);
    });
    await page.mouse.move(x(0.2), y(0.5));
    await page.mouse.down();
    await page.mouse.move(x(0.8), y(0.5), { steps: 16 });
    await page.mouse.up();
    const original = await pixels();
    expect(original.every(v => v < 100)).toBe(true);
    if (mode === "toolbar") {
      await page.getByRole("button", { name: "Eraser", exact: true }).click();
      await page.mouse.move(x(0.5), y(0.4));
      await page.mouse.down();
      await page.mouse.move(x(0.5), y(0.6), { steps: 8 });
      await page.mouse.up();
    } else {
      // Synthetic browser contract only: dispatched events cannot capture a native pointer.
      await canvas.evaluate((c) => { c.setPointerCapture = () => {}; });
      const event = { pointerType: "pen", pointerId: 71, pressure: 0.5,
        button: mode === "pen-button" ? 5 : 0,
        buttons: mode === "pen-bitmask" ? 32 : 0, clientX: x(0.5) };
      await canvas.dispatchEvent("pointerdown", { ...event, clientY: y(0.4) });
      await canvas.dispatchEvent("pointermove", { ...event, clientY: y(0.6) });
      await canvas.dispatchEvent("pointerup", { ...event, buttons: 0, clientY: y(0.6) });
    }
    const erased = await pixels();
    expect(erased).toEqual([original[0], 255, original[2]]);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    expect(await pixels()).toEqual(original);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    expect(await pixels()).toEqual(erased);
    await page.reload();
    expect(await pixels()).toEqual(erased);
    await page.getByRole("button", { name: "Quill", exact: true }).click();
    await page.mouse.click(x(0.5), y(0.5));
    expect((await pixels())[1]).toBeLessThan(100);
  });
}
