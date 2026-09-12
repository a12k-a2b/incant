import { test, expect } from "@playwright/test";
// R-09: a touch (palm/finger) landing on the wand while the pen is mid-stroke
// locks the parchment and cuts the stroke. Synthetic pointer contract only.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("incant-introduction-v1", "seen");
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: () => new Promise(() => {}), // permission prompt never answered
    });
  });
});
test("touch on the wand mid pen stroke cuts the stroke and locks the page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1184, height: 1584 });
  await page.goto("/");
  const canvas = page.locator("canvas");
  await canvas.evaluate((c: HTMLCanvasElement) => {
    c.setPointerCapture = () => {};
  });
  const r = (await canvas.boundingBox())!;
  const pen = (type: string, fx: number, buttons = 1, button = 0) =>
    canvas.dispatchEvent(type, {
      pointerType: "pen",
      pointerId: 5,
      button,
      buttons,
      pressure: buttons ? 0.5 : 0,
      clientX: r.x + r.width * fx,
      clientY: r.y + r.height * 0.5,
    });
  // A committed stroke first, so the page is not "empty".
  await page.mouse.move(r.x + r.width * 0.2, r.y + r.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width * 0.5, r.y + r.height * 0.3);
  await page.mouse.up();
  await pen("pointerdown", 0.2);
  await pen("pointermove", 0.25, 1, -1);
  await pen("pointermove", 0.3, 1, -1);
  await pen("pointermove", 0.4, 1, -1);
  // Palm lands on the wand at the bottom centre.
  const wand = page.locator(".voice-wand");
  await wand.evaluate((b: HTMLButtonElement) => {
    b.setPointerCapture = () => {}; // synthetic pointer ids cannot be captured
  });
  const wb = (await wand.boundingBox())!;
  await wand.dispatchEvent("pointerdown", {
    pointerType: "touch",
    pointerId: 9,
    button: 0,
    buttons: 1,
    isPrimary: false,
    clientX: wb.x + wb.width / 2,
    clientY: wb.y + wb.height / 2,
  });
  await expect(page.locator("main")).toHaveClass(/phase-connecting/);
  await pen("pointermove", 0.5, 1, -1);
  await pen("pointermove", 0.6, 1, -1);
  await pen("pointerup", 0.6, 0, 0);
  const pixels = await canvas.evaluate((c: HTMLCanvasElement) => {
    const ctx = c.getContext("2d")!;
    return [0.3, 0.55].map(
      (f) => ctx.getImageData(Math.floor(c.width * f), Math.floor(c.height * 0.5), 1, 1).data[0],
    );
  });
  console.log("ink at 30% (before palm):", pixels[0], "| ink at 55% (after palm):", pixels[1]);
  const label = await wand.getAttribute("aria-label");
  console.log("wand state while palm rests:", label);
  expect(pixels[0]).toBeLessThan(100);
  // Oracle: the pen stroke should continue unbroken; a resting palm is not a wand press.
  expect(pixels[1]).toBeLessThan(100);
});
