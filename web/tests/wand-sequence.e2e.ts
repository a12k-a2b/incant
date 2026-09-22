import { test, expect } from "@playwright/test";
for (const pressMs of [80, 360, 550])
  test(`first gesture over a result casts again with original sketch (${pressMs}ms)`, async ({
    page,
  }) => {
    const hold = pressMs >= 450;
    await page.addInitScript(() => {
      localStorage.setItem("incant-introduction-v1", "seen");
      const ctx = new AudioContext(),
        dest = ctx.createMediaStreamDestination();
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        value: async () => dest.stream,
      });
      class Socket {
        static OPEN = 1;
        readyState = 1;
        onopen: any;
        onmessage: any;
        onclose: any;
        constructor() {
          setTimeout(() => this.onopen?.(), 10);
        }
        send(raw: string) {
          const m = JSON.parse(raw);
          if (m.setup)
            setTimeout(
              () =>
                this.onmessage?.({
                  data: JSON.stringify({ setupComplete: {} }),
                }),
              10,
            );
          if (m.realtimeInput?.activityEnd)
            setTimeout(
              () =>
                this.onmessage?.({
                  data: JSON.stringify({
                    serverContent: {
                      inputTranscription: {
                        text: "A winter cottage",
                        finished: true,
                      },
                      turnComplete: true,
                    },
                  }),
                }),
              100,
            );
        }
        close() {
          this.readyState = 3;
          this.onclose?.();
        }
      }
      Object.defineProperty(window, "WebSocket", { value: Socket });
    });
    let tokenRelease!: () => void;
    const gate = new Promise<void>((r) => (tokenRelease = r));
    await page.route("**/api/gemini-token", async (r) => {
      await gate;
      await r.fulfill({ json: { token: "synthetic" } });
    });
    const casts: any[] = [];
    let image = "";
    await page.route("**/api/cast", async (r) => {
      casts.push(r.request().postDataJSON());
      await r.fulfill({ json: { ok: true, imageBase64: image.split(",")[1] } });
    });
    await page.route("**/api/owl", (r) =>
      r.request().method() === "GET"
        ? r.fulfill({ json: [] })
        : r.fulfill({ status: 503, json: { error: "Synthetic post offline" } }),
    );
    await page.goto("/");
    const c = page.locator("canvas"),
      b = (await c.boundingBox())!;
    await page.mouse.move(b.x + b.width * 0.4, b.y + b.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.4);
    await page.mouse.up();
    image = await c.evaluate((c: HTMLCanvasElement) => c.toDataURL());
    await page
      .getByRole("button", { name: "Type a spell", exact: true })
      .click();
    await page
      .getByLabel("Type your spell", { exact: true })
      .fill("A summer cottage");
    await page.getByRole("button", { name: "Cast typed spell" }).click();
    await expect(page.locator("main")).toHaveAttribute(
      "data-cast-stage",
      "strike",
    );
    await expect(page.locator(".manifestation")).toHaveCount(0);
    await expect(page.locator(".manifestation")).toBeVisible();
    await expect(page.locator(".spell-fog")).toHaveCount(0, { timeout: 8000 });
    await page.evaluate(() => {
      (window as any).flights = 0;
      new MutationObserver((records) => {
        for (const record of records)
          for (const node of record.addedNodes)
            if (node instanceof Element && node.matches(".spell-flight"))
              (window as any).flights++;
      }).observe(document.querySelector("main")!, {
        childList: true,
        subtree: true,
      });
    });
    const wand = page.locator(".voice-wand");
    await wand.hover();
    await page.evaluate(() =>
      document.querySelector(".voice-wand")!.addEventListener(
        "pointerdown",
        (event) => {
          (window as any).pressSample = {
            stamp: event.timeStamp,
            id: (event as PointerEvent).pointerId,
          };
        },
        { once: true },
      ),
    );
    await page.mouse.down();
    if (pressMs === 360) {
      // Preserve an exact physical-event duration despite test-runner transport
      // delays. Quick-tap and hold variants still use real Chromium mouse up.
      await page.evaluate(() => {
        const sample = (window as any).pressSample;
        const up = new PointerEvent("pointerup", {
          bubbles: true,
          pointerId: sample.id,
          pointerType: "mouse",
          button: 0,
        });
        Object.defineProperty(up, "timeStamp", { value: sample.stamp + 360 });
        document.querySelector(".voice-wand")!.dispatchEvent(up);
      });
    } else await page.waitForTimeout(pressMs);
    await page.mouse.up();
    await expect(page.locator("main")).toHaveClass(
      hold ? /phase-finishing/ : /phase-connecting/,
    );
    if (hold) {
      await expect(page.locator(".spell-flight")).toHaveCount(1);
      await expect(page.locator("main")).toHaveAttribute(
        "data-cast-stage",
        "strike",
      );
    }
    await expect(page.locator(".manifestation")).toHaveCount(0);
    // A short held recording can finish while the network is still connecting.
    tokenRelease();
    if (!hold) {
      await expect(page.locator("main")).toHaveClass(/phase-listening/);
      await page
        .locator("canvas")
        .dispatchEvent("pointerdown", { pointerType: "touch", pointerId: 77 });
      await expect(page.locator("main")).toHaveClass(/phase-listening/);
      await wand.click();
    }
    await expect.poll(() => casts.length).toBe(2);
    expect(casts[1].incantation).toBe("A winter cottage");
    expect(casts[1].sketchPngBase64).toBe(image);
    await expect(page.locator(".manifestation")).toBeVisible();
    await page.waitForTimeout(300);
    expect(casts).toHaveLength(2);
    expect(await page.evaluate(() => (window as any).flights)).toBe(1);
  });
test("dragon settings persist voice and owl choices without adding an owl icon", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("incant-introduction-v1", "seen"),
  );
  await page.setViewportSize({ width: 1184, height: 1584 });
  await page.goto("/");
  await expect(page.locator(".owl-key span")).toHaveCount(0);
  await page.getByRole("button", { name: "Dragon settings" }).click();
  await expect(page.locator(".dragon-flame")).toBeVisible();
  const d = page.getByRole("dialog", { name: "Dragon settings" });
  await expect(d).toBeVisible();
  await page.getByLabel("Talk with the wand", { exact: true }).check();
  await page.getByLabel("Open the post tray first", { exact: true }).check();
  await page.screenshot({ path: "../docs/evidence/dragon-settings.png" });
  await page.getByRole("button", { name: "Close settings" }).click();
  await page.reload();
  await expect(page.locator("main")).toHaveAttribute(
    "data-voice-mode",
    "conversation",
  );
  await page.getByRole("button", { name: "Dragon settings" }).click();
  await expect(
    page.getByLabel("Open the post tray first", { exact: true }),
  ).toBeChecked();
});
