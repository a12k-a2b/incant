import { test, expect } from "@playwright/test";
for (const reduced of [false, true])
  test(`wand acknowledges connection immediately and signals actual listening${reduced ? " with reduced motion" : ""}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1184, height: 1584 });
    if (reduced) await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      localStorage.setItem("incant-introduction-v1", "seen");
      const context = new AudioContext(),
        dest = context.createMediaStreamDestination();
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        value: () =>
          new Promise((resolve) => {
            (window as any).grantMic = () => resolve(dest.stream);
          }),
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
                      inputTranscription: { text: "A synthetic cottage" },
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
    await page.route("**/api/cast", (r) =>
      r.fulfill({
        status: 400,
        json: { ok: false, error: "Synthetic cast stopped" },
      }),
    );
    await page.goto("/");
    const c = (await page.locator("canvas").boundingBox())!;
    await page.mouse.move(c.x + c.width * 0.4, c.y + c.height * 0.55);
    await page.mouse.down();
    await page.mouse.move(c.x + c.width * 0.5, c.y + c.height * 0.4);
    await page.mouse.move(c.x + c.width * 0.6, c.y + c.height * 0.55);
    await page.mouse.up();
    const wand = page.locator(".voice-wand"),
      b = (await wand.boundingBox())!;
    await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.5);
    await page.mouse.down();
    // Exercise a hold, not the intentional sub-450ms tap-to-listen gesture.
    await page.waitForTimeout(550);
    await expect(page.locator("main")).toHaveClass(/phase-connecting/);
    await expect(page.locator(".wand-feedback")).toHaveCSS("opacity", "1");
    await expect(page.locator("#wand-status")).toHaveText("Waking the wand…");
    await expect(page.locator("#wand-status")).toHaveCSS("clip-path", "none");
    await expect(page.locator(".wand-ready-sigil")).toHaveCSS("opacity", "0");
    await expect(page.locator(".wand-wave-one")).toHaveCSS(
      "animation-name",
      reduced ? "none" : "wand-press-ripple",
    );
    if (!reduced)
      await page.screenshot({
        path: "../docs/evidence/wand-press-connecting.png",
      });
    await page.evaluate(() => (window as any).grantMic());
    await expect(page.locator("main")).toHaveClass(/phase-listening/);
    await expect(page.locator(".wand-ready-sigil")).toHaveCSS("opacity", "1");
    await expect(page.locator("#wand-status")).toHaveText(
      "Listening · speak your spell",
    );
    await expect(page.locator(".wand-wave-one")).toHaveCSS(
      "animation-name",
      reduced ? "none" : "wand-listening-ripple",
    );
    if (!reduced)
      await page.screenshot({
        path: "../docs/evidence/wand-press-listening.png",
      });
    await page.mouse.up();
    await expect(page.locator("main")).toHaveClass(/phase-finishing/);
    await expect(page.locator(".spell-fog")).toHaveCount(0);
    await expect(page.locator(".spell-flight")).toHaveCount(1);
    await expect(page.locator("main")).toHaveClass(/phase-idle/);
    await expect(page.getByRole("alert")).toHaveCSS("clip-path", "none");
    await expect(page.locator(".wand-feedback")).toHaveCSS("opacity", "0");
  });
