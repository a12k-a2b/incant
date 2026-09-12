import { test, expect } from "@playwright/test";
// R-02/R-03: what happens to an already-typed spell when the wand hears
// nothing, and whether the wand can be operated by click/Enter at all.
function fakeVoice(transcript: string) {
  return `
    localStorage.setItem("incant-introduction-v1", "seen");
    window.__audioFrames = 0;
    const ctx = new AudioContext(), dest = ctx.createMediaStreamDestination();
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: async () => dest.stream });
    class Socket {
      static OPEN = 1; readyState = 1; onopen; onmessage; onclose; onerror;
      constructor() { setTimeout(() => this.onopen?.(), 5); }
      send(raw) {
        const m = JSON.parse(raw);
        if (m.realtimeInput?.audio) window.__audioFrames++;
        if (m.setup) setTimeout(() => this.onmessage?.({ data: JSON.stringify({ setupComplete: {} }) }), 5);
        if (m.realtimeInput?.activityEnd) setTimeout(() => this.onmessage?.({ data: JSON.stringify({ serverContent: { inputTranscription: { text: ${JSON.stringify(transcript)} }, turnComplete: true } }) }), 10);
      }
      close() { this.readyState = 3; this.onclose?.(); }
    }
    Object.defineProperty(window, "WebSocket", { value: Socket });
  `;
}
async function draw(page: any) {
  const c = page.locator("canvas"),
    r = (await c.boundingBox())!;
  await page.mouse.move(r.x + r.width * 0.3, r.y + r.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width * 0.6, r.y + r.height * 0.5);
  await page.mouse.up();
}
test("silent wand press erases a typed spell that was never cast", async ({
  page,
}) => {
  await page.addInitScript(fakeVoice(""));
  await page.route("**/api/gemini-token", (r) =>
    r.fulfill({ json: { ok: true, token: "synthetic" } }),
  );
  let casts = 0;
  await page.route("**/api/cast", (r) => {
    casts++;
    return r.fulfill({ status: 400, json: { ok: false, error: "stop" } });
  });
  await page.goto("/");
  await draw(page);
  await page.getByRole("button", { name: "Type a spell", exact: true }).click();
  const field = page.getByLabel("Type your spell", { exact: true });
  const typed =
    "A long carefully typed spell: a lighthouse on a cliff at dusk, oil on canvas, warm lamplight";
  await field.fill(typed);
  await page.getByRole("button", { name: "Close typed spell" }).click();
  expect(await page.evaluate(() => localStorage.getItem("incant-spell-v2"))).toBe(
    typed,
  );
  const wand = page.locator(".voice-wand");
  const b = (await wand.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(400);
  await expect(page.locator("main")).toHaveClass(/phase-listening/);
  await page.mouse.up();
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("heard no words", { timeout: 15000 });
  const stored = await page.evaluate(() =>
    localStorage.getItem("incant-spell-v2"),
  );
  await page.getByRole("button", { name: "Type a spell", exact: true }).click();
  const now = await field.inputValue();
  console.log("typed spell after silent wand:", JSON.stringify(now), "stored:", JSON.stringify(stored));
  expect(casts).toBe(0);
  // Oracle for the defect: typed words should survive an empty dictation.
  expect(now).toBe(typed);
});
test("wand ignores click activation and treats an Enter tap as an empty hold", async ({
  page,
}) => {
  await page.addInitScript(fakeVoice("A spoken dragon"));
  await page.route("**/api/gemini-token", (r) =>
    r.fulfill({ json: { ok: true, token: "synthetic" } }),
  );
  let sent = "";
  await page.route("**/api/cast", (r) => {
    sent = r.request().postDataJSON().incantation;
    return r.fulfill({ status: 400, json: { ok: false, error: "stop" } });
  });
  await page.goto("/");
  await draw(page);
  const wand = page.locator(".voice-wand");
  // Assistive technologies (TalkBack double-tap, switch access) send click.
  await wand.evaluate((b: HTMLButtonElement) => b.click());
  await page.waitForTimeout(500);
  const phaseAfterClick = await page
    .locator("main")
    .evaluate((m) => m.getAttribute("data-cast-stage"));
  console.log("phase after synthetic click:", phaseAfterClick);
  // Keyboard user: a normal Enter press (down + up) on the focused wand.
  await wand.focus();
  await page.keyboard.press("Enter");
  const alert = page.getByRole("alert");
  await expect(alert).toBeVisible({ timeout: 15000 });
  const tapFrames = await page.evaluate(() => (window as any).__audioFrames);
  console.log("audio frames sent during a keyboard Enter tap:", tapFrames, "| cast sent:", JSON.stringify(sent));
  await page.getByRole("button", { name: "Dismiss message" }).click();
  // Same user holding Space for a second instead.
  await page.evaluate(() => ((window as any).__audioFrames = 0));
  await wand.focus();
  await page.keyboard.down("Space");
  await expect(page.locator("main")).toHaveClass(/phase-listening/);
  await page.waitForTimeout(1000);
  await page.keyboard.up("Space");
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 15000 });
  const holdFrames = await page.evaluate(() => (window as any).__audioFrames);
  console.log("audio frames sent during a one second Space hold:", holdFrames);
  expect(phaseAfterClick).toBe("idle");
  expect(holdFrames).toBeGreaterThan(0);
  // Oracle: a keyboard tap should open a hands-free listening window like a pointer tap.
  expect(tapFrames).toBeGreaterThan(0);
});
