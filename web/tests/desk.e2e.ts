import { test, expect, type Page } from "@playwright/test";
async function draw(page: Page) {
  await expect(
    page.getByRole("button", { name: /^(Dragon settings|Open desk tools)$/ }),
  ).toBeEnabled();
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

async function openTools(page: Page) {
  if (
    !(await page
      .locator(".desk-drawer")
      .evaluate((d: HTMLDialogElement) => d.open))
  )
    await page
      .getByRole("button", { name: "Open desk tools", exact: true })
      .click();
}
async function closeTools(page: Page) {
  if (
    await page
      .locator(".desk-drawer")
      .evaluate((d: HTMLDialogElement) => d.open)
  )
    await page
      .getByRole("button", { name: "Close desk tools", exact: true })
      .click();
}
async function writeSpell(page: Page, text: string) {
  await openTools(page);
  await page.getByLabel("THE INCANTATION", { exact: true }).fill(text);
}
async function png(page: Page) {
  return page
    .locator("canvas")
    .evaluate((c: HTMLCanvasElement) => c.toDataURL());
}

test("immersive desk keeps tools tucked away and palm input ignored", async ({
  page,
}) => {
  await page.goto("/?mode=desk");
  await expect(page.getByText("Begin with a scribble")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cast spell", exact: true }),
  ).not.toBeVisible();
  await expect(page.locator(".voice-wand")).toHaveText("");
  await page
    .locator("canvas")
    .dispatchEvent("pointerdown", { pointerType: "touch", pointerId: 9 });
  await page
    .locator("canvas")
    .dispatchEvent("pointerup", { pointerType: "touch", pointerId: 9 });
  await expect(page.getByText("Begin with a scribble")).toBeVisible();
  await draw(page);
  await openTools(page);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await closeTools(page);
  await expect(page.getByText("Begin with a scribble")).toBeVisible();
  await openTools(page);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await writeSpell(page, "A remembered cottage");
  await page.reload();
  await expect(page.getByText("Begin with a scribble")).not.toBeVisible();
  await openTools(page);
  await expect(page.getByLabel("THE INCANTATION", { exact: true })).toHaveValue(
    "A remembered cottage",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator(".desk-drawer")).not.toBeVisible();
});
test("failed cast clears fog and preserves original sketch and retry", async ({
  page,
}) => {
  await page.goto("/?mode=desk");
  await draw(page);
  const original = await png(page);
  await writeSpell(page, "A cottage");
  await page.route("**/api/cast", (r) => r.abort("failed"));
  await page.getByRole("button", { name: "Cast spell", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".spell-fog")).toHaveCount(0);
  expect(await png(page)).toBe(original);
  await openTools(page);
  await expect(
    page.getByRole("button", { name: "Cast spell", exact: true }),
  ).toBeEnabled();
});
test("casting fog reveals a saved image and historical reroll keeps its source", async ({
  page,
}) => {
  await page.goto("/?mode=desk");
  await draw(page);
  const original = await png(page);
  await page.route("**/api/cast", async (r) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await r.fulfill({
      json: {
        ok: true,
        imageBase64: original.split(",")[1],
        mime: "image/png",
      },
    });
  });
  await writeSpell(page, "A synthetic cottage");
  await page.getByRole("button", { name: "Cast spell", exact: true }).click();
  await expect(page.locator(".spell-fog")).toBeVisible();
  await expect(page.locator(".manifestation.image-ready")).toBeVisible();
  await expect(page.locator(".spell-fog")).toHaveCount(0, { timeout: 6000 });
  await openTools(page);
  await expect(
    page.getByRole("button", { name: "Save image", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to sketch", exact: true })
    .click();
  await closeTools(page);
  expect(await png(page)).toBe(original);
  await draw(page);
  await writeSpell(page, "Unrelated new words");
  await page.reload();
  await openTools(page);
  await page
    .getByRole("button", {
      name: "Open image: A synthetic cottage",
      exact: true,
    })
    .click();
  let sent: any;
  await page.route("**/api/cast", async (r) => {
    sent = r.request().postDataJSON();
    await r.fulfill({
      status: 400,
      json: { ok: false, error: "Synthetic reroll stop" },
    });
  });
  await page.getByRole("button", { name: "Another", exact: true }).click();
  await expect.poll(() => sent?.incantation).toBe("A synthetic cottage");
  expect(sent.sketchPngBase64).toBe(original);
});
test("cancelled spell cannot replace drawing with a late result", async ({
  page,
}) => {
  await page.goto("/?mode=desk");
  await draw(page);
  const original = await png(page);
  await writeSpell(page, "Cancel me");
  await page.route("**/api/cast", async (r) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await r
      .fulfill({
        json: {
          ok: true,
          imageBase64: original.split(",")[1],
          mime: "image/png",
        },
      })
      .catch(() => {});
  });
  await page.getByRole("button", { name: "Cast spell", exact: true }).click();
  await page.getByRole("button", { name: "Stop waiting", exact: true }).click();
  await page.waitForTimeout(1300);
  await expect(page.locator(".manifestation")).toHaveCount(0);
  await expect(page.locator(".spell-fog")).toHaveCount(0);
  expect(await png(page)).toBe(original);
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
    await page.goto("/?mode=desk");
    const c = page.locator("canvas"),
      r = (await c.boundingBox())!;
    expect((r.width * r.height) / (width * height)).toBeGreaterThan(0.54);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page.locator(".voice-wand")).toBeInViewport();
    await expect(page.locator(".desk-latch")).toBeInViewport();
    await page.screenshot({ path: `../docs/evidence/immersive-${name}.png` });
    await openTools(page);
    await expect(
      page.getByRole("button", { name: "Cast spell", exact: true }),
    ).toBeInViewport();
  });
}
test("resize retains exact original drawing pixels", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/?mode=desk");
  await draw(page);
  const original = await png(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(100);
  expect(await png(page)).toBe(original);
});
test("reduced motion disables fog motion and image reveal animation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?mode=desk");
  await draw(page);
  const original = await png(page);
  await page.route("**/api/cast", (r) =>
    r.fulfill({
      json: {
        ok: true,
        imageBase64: original.split(",")[1],
        mime: "image/png",
      },
    }),
  );
  await writeSpell(page, "Still magic");
  await page.getByRole("button", { name: "Cast spell", exact: true }).click();
  await expect(page.locator(".manifestation.image-ready")).toBeVisible();
  expect(
    await page
      .locator(".manifestation")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
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
                this.onmessage?.({
                  data: JSON.stringify({ setupComplete: {} }),
                }),
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
    await page.goto("/?mode=desk");
    await draw(page);
    await writeSpell(page, "An old typed cottage");
    await closeTools(page);
    await page
      .getByRole("button", { name: "Type a spell", exact: true })
      .click();
    await page.getByRole("button", { name: "Close typed spell" }).click();
    await expect(page.getByLabel("Type your spell")).not.toHaveAttribute(
      "autofocus",
      "",
    );
    const b = page.locator(".voice-wand");
    const session =
      input === "touch-hold" ? await page.context().newCDPSession(page) : null;
    const box = (await b.boundingBox())!;
    if (session) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
      });
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
      expect(
        await b.evaluate((el) =>
          el.dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
          ),
        ),
      ).toBe(false);
      await b.dispatchEvent("pointerup", {
        pointerId: 999,
        pointerType: "touch",
      });
      await expect(
        page.getByRole("button", { name: /Listening… release/ }),
      ).toBeVisible();
      expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
        "",
      );
      await session.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    } else if (input === "tap") {
      await expect(
        page.getByRole("button", { name: /Listening… tap to cast/ }),
      ).toBeVisible();
      await page.locator("canvas").click({ position: { x: 50, y: 50 } });
      await expect(
        page.getByRole("button", { name: /Listening… tap to cast/ }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: /Listening… tap to cast/ })
        .click();
    } else {
      await page.waitForTimeout(550);
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
  await page.goto("/?mode=desk");
  await draw(page);
  const b = page.locator(".voice-wand");
  const box = (await b.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(
    page.getByRole("button", { name: /Connecting… keep holding/ }),
  ).toBeVisible();
  await page.waitForTimeout(550);
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => (window as any).__stopped))
    .toBe(true);
  expect(tokens).toBe(0);
  await expect(
    page.getByRole("button", { name: /[Hh]old to speak/ }),
  ).toBeEnabled();
});
for (const mode of ["pen-button", "pen-bitmask", "toolbar"] as const) {
  test(`pixel eraser ${mode}: partial line, undo, redo, reload, and draw again`, async ({
    page,
  }) => {
    await page.goto("/?mode=desk");
    const canvas = page.locator("canvas");
    const r = (await canvas.boundingBox())!;
    const x = (f: number) => r.x + r.width * f;
    const y = (f: number) => r.y + r.height * f;
    const pixels = () =>
      canvas.evaluate((c: HTMLCanvasElement) => {
        const ctx = c.getContext("2d")!;
        return [0.25, 0.5, 0.75].map(
          (f) =>
            ctx.getImageData(
              Math.floor(c.width * f),
              Math.floor(c.height * 0.5),
              1,
              1,
            ).data[0],
        );
      });
    await page.mouse.move(x(0.2), y(0.5));
    await page.mouse.down();
    await page.mouse.move(x(0.8), y(0.5), { steps: 16 });
    await page.mouse.up();
    const original = await pixels();
    expect(original.every((v) => v < 100)).toBe(true);
    if (mode === "toolbar") {
      await openTools(page);
      await page.getByRole("button", { name: "Eraser", exact: true }).click();
      await closeTools(page);
      await page.mouse.move(x(0.5), y(0.4));
      await page.mouse.down();
      await page.mouse.move(x(0.5), y(0.6), { steps: 8 });
      await page.mouse.up();
    } else {
      // Synthetic browser contract only: dispatched events cannot capture a native pointer.
      await canvas.evaluate((c) => {
        c.setPointerCapture = () => {};
      });
      const event = {
        pointerType: "pen",
        pointerId: 71,
        pressure: 0.5,
        button: mode === "pen-button" ? 5 : 0,
        buttons: mode === "pen-bitmask" ? 32 : 0,
        clientX: x(0.5),
      };
      await canvas.dispatchEvent("pointerdown", { ...event, clientY: y(0.4) });
      await canvas.dispatchEvent("pointermove", { ...event, clientY: y(0.6) });
      await canvas.dispatchEvent("pointerup", {
        ...event,
        buttons: 0,
        clientY: y(0.6),
      });
    }
    const erased = await pixels();
    expect(erased).toEqual([original[0], 255, original[2]]);
    await openTools(page);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    expect(await pixels()).toEqual(original);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    expect(await pixels()).toEqual(erased);
    await page.reload();
    expect(await pixels()).toEqual(erased);
    await openTools(page);
    await page.getByRole("button", { name: "Quill", exact: true }).click();
    await closeTools(page);
    await page.mouse.click(x(0.5), y(0.5));
    expect((await pixels())[1]).toBeLessThan(100);
  });
}

test("typewriter focuses the bubble, retains words, and casts once", async ({
  page,
}) => {
  await page.goto("/");
  await draw(page);
  await page.getByRole("button", { name: "Type a spell", exact: true }).click();
  const field = page.getByRole("textbox", {
    name: "Type your spell",
    exact: true,
  });
  await expect(field).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Cast typed spell", exact: true }),
  ).toBeDisabled();
  await field.fill("A moonlit cottage");
  await page
    .getByRole("button", { name: "Close typed spell", exact: true })
    .click();
  await expect(page.locator(".type-bubble")).not.toBeVisible();
  await page.getByRole("button", { name: "Type a spell", exact: true }).click();
  await expect(field).toHaveValue("A moonlit cottage");
  await page.reload();
  await page.getByRole("button", { name: "Type a spell", exact: true }).click();
  await expect(field).toHaveValue("A moonlit cottage");
  let requests = 0;
  await page.route("**/api/cast", async (r) => {
    requests++;
    expect(r.request().postDataJSON().incantation).toBe("A moonlit cottage");
    await r.fulfill({
      status: 400,
      json: { ok: false, error: "Synthetic typed cast verified" },
    });
  });
  await page
    .getByRole("button", { name: "Cast typed spell", exact: true })
    .click();
  await expect(page.locator(".type-bubble")).not.toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "Synthetic typed cast verified",
  );
  expect(requests).toBe(1);
});
test("typewriter bubble fits narrow keyboard-sized viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 500 });
  await page.goto("/");
  await page.getByRole("button", { name: "Type a spell", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Type your spell", exact: true }),
  ).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "Cast typed spell", exact: true }),
  ).toBeInViewport();
  await page.screenshot({
    path: "../docs/evidence/typewriter-bubble-phone.png",
  });
  await page.keyboard.press("Escape");
  await expect(page.locator(".type-bubble")).not.toBeVisible();
});

test("typewriter stays stable through keyboard viewport changes and restores wand flow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await page.addInitScript(() => {
    let height = window.innerHeight;
    const viewport = new EventTarget() as EventTarget & {
      height: number;
      offsetTop: number;
      scale: number;
    };
    Object.defineProperties(viewport, {
      height: { get: () => height },
      offsetTop: { value: 0 },
      scale: { value: 1 },
    });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: viewport,
    });
    (window as any).simulateKeyboardViewport = (nextHeight: number) => {
      height = nextHeight;
      viewport.dispatchEvent(new Event("resize"));
    };
  });
  await page.goto("/");
  await draw(page);
  const canvas = page.locator("canvas");
  const before = await canvas.evaluate((node: HTMLCanvasElement) => ({
    width: node.width,
    height: node.height,
    pixels: node.toDataURL(),
  }));
  await page.getByRole("button", { name: "Type a spell", exact: true }).click();
  const field = page.getByRole("textbox", { name: "Type your spell", exact: true });
  await expect(field).toBeFocused();
  const bubble = page.locator(".type-bubble");
  const beforeRect = await bubble.boundingBox();
  expect(beforeRect).not.toBeNull();
  for (const height of [500, 420, 360, 200]) {
    await page.setViewportSize({ width: height === 200 ? 700 : 900, height });
    await page.evaluate(
      (nextHeight) => (window as any).simulateKeyboardViewport(nextHeight),
      height,
    );
    const dialogRect = await bubble.boundingBox();
    expect(dialogRect).not.toBeNull();
    expect(Math.abs(dialogRect!.y - beforeRect!.y)).toBeLessThanOrEqual(1);
    expect(dialogRect!.y + dialogRect!.height).toBeLessThanOrEqual(height + 1);
    await expect(bubble).toBeInViewport();
    const castButton = page.getByRole("button", {
      name: "Cast typed spell",
      exact: true,
    });
    await castButton.scrollIntoViewIfNeeded();
    await expect(castButton).toBeInViewport();
  }
  expect(
    await canvas.evaluate((node: HTMLCanvasElement) => ({
      width: node.width,
      height: node.height,
      pixels: node.toDataURL(),
    })),
  ).toEqual(before);

  await page.getByRole("button", { name: "Close typed spell", exact: true }).click();
  await expect(bubble).not.toBeVisible();
  await page.setViewportSize({ width: 900, height: 700 });
  await page.evaluate(() =>
    (window as any).simulateKeyboardViewport(window.innerHeight),
  );
  expect(
    await canvas.evaluate((node: HTMLCanvasElement) => ({
      width: node.width,
      height: node.height,
      pixels: node.toDataURL(),
    })),
  ).toEqual(before);
  await page.getByRole("button", { name: "Type a spell", exact: true }).click();
  await expect(field).toBeFocused();
  await page.getByRole("button", { name: "Close typed spell", exact: true }).click();
  await page.evaluate(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: () => new Promise(() => {}),
    });
  });
  await page.locator(".voice-wand").click();
  await expect(page.locator("main")).toHaveClass(/phase-connecting/);
  expect(
    await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL()),
  ).toBe(before.pixels);
});

test("immersive mode keeps the wand and illustrated typewriter, including while casting", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".immersive-mode")).toBeVisible();
  await expect(page.getByRole("button")).toHaveCount(7);
  await expect(page.locator(".typewriter-key")).toBeVisible();
  await expect(page.locator(".desk-latch")).not.toBeVisible();
  await expect(page.locator(".empty-parchment")).not.toBeVisible();
  await draw(page);
  // Seed a typed spell through the preserved rollback view, then return to the default room.
  await page.goto("/?mode=desk");
  await writeSpell(page, "A synthetic test");
  await closeTools(page);
  await page.goto("/");
  await page.screenshot({ path: "../docs/evidence/immersive-mode.png" });
  await expect(page.locator("canvas")).toBeVisible();
  const original = await png(page);
  let releaseCast!: () => void;
  const castGate = new Promise<void>((resolve) => (releaseCast = resolve));
  let castResponses = 0;
  await page.route("**/api/cast", async (r) => {
    await castGate;
    await r
      .fulfill({
        json: {
          ok: true,
          imageBase64: original.split(",")[1],
          mime: "image/png",
        },
      })
      .catch(() => {});
    castResponses++;
  });
  // Set up casting independently of the separately tested speech adapter.
  await page
    .locator(".cast-button")
    .evaluate((b: HTMLButtonElement) => b.click());
  await expect(page.locator(".phase-casting")).toBeVisible();
  await expect(page.locator(".voice-wand")).toBeVisible();
  await expect(page.locator(".typewriter-key")).toBeVisible();
  await page.locator(".voice-wand").click();
  await expect(page.locator("main")).toHaveClass(/phase-idle/);
  releaseCast();
  await expect.poll(() => castResponses).toBe(1);
  await expect(page.locator(".spell-fog")).toHaveCount(0);
  await expect(page.locator(".manifestation")).toHaveCount(0);
  await page
    .locator(".cast-button")
    .evaluate((b: HTMLButtonElement) => b.click());
  await expect(page.locator(".manifestation.image-ready")).toBeVisible();
  await expect(page.getByRole("button")).toHaveCount(7);
  await page.evaluate(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: () => new Promise(() => {}),
    });
  });
  await page.locator(".voice-wand").click();
  await expect(page.locator("main")).toHaveClass(/phase-connecting/);
  await expect(page.locator(".manifestation")).toHaveCount(0);
  expect(await png(page)).toBe(original);
});

test("typewriter focuses only the writing field and releases its viewport lock on close", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    (window as any).focusTrail = [];
    document.addEventListener("focusin", (e) => {
      const t = e.target as HTMLElement;
      if (t.closest(".type-bubble"))
        (window as any).focusTrail.push(t.getAttribute("aria-label"));
    });
  });
  await page.getByRole("button", { name: "Type a spell", exact: true }).click();
  expect(await page.evaluate(() => (window as any).focusTrail)).toEqual([
    "Type your spell",
  ]);
  const height = await page.locator("main").evaluate((e) => e.style.height);
  expect(height).not.toBe("");
  await page.getByRole("button", { name: "Close typed spell" }).click();
  await expect
    .poll(() => page.locator("main").evaluate((e) => e.style.height))
    .toBe("");
});

// These existing flows exercise a returning user; first-visit behavior has its own suite.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("incant-introduction-v1", "seen"),
  );
});
