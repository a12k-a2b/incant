import { test, expect } from "@playwright/test";
// R-06: draft strokes are stored in localStorage at full double precision; the
// whole drawing is re-serialised on every stroke. Measure bytes per point and
// what a full localStorage does to ink durability.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("incant-introduction-v1", "seen"),
  );
});
test("bytes per stroke point and behaviour when the draft no longer fits", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1184, height: 1584 });
  await page.goto("/");
  const canvas = page.locator("canvas"),
    r = (await canvas.boundingBox())!;
  // One long scribble with many samples, like a stylus at 240 Hz.
  await page.mouse.move(r.x + r.width * 0.2, r.y + r.height * 0.3);
  await page.mouse.down();
  for (let i = 1; i <= 200; i++) {
    await page.mouse.move(
      r.x + r.width * (0.2 + 0.6 * (i / 200)),
      r.y + r.height * (0.3 + 0.2 * Math.sin(i / 7)),
    );
  }
  await page.mouse.up();
  const stats = await page.evaluate(() => {
    const raw = localStorage.getItem("incant-drawing-v2") || "[]";
    const strokes = JSON.parse(raw);
    const points = strokes.reduce((n: number, s: any) => n + s.points.length, 0);
    return { bytes: raw.length, points, perPoint: raw.length / points, sample: strokes[0].points[3] };
  });
  console.log("draft stats:", JSON.stringify(stats));
  const budget = 5 * 1024 * 1024;
  console.log(
    `points before a 5 MiB localStorage budget: ~${Math.floor(budget / stats.perPoint)} (≈${Math.floor(budget / stats.perPoint / 240 / 60)} min of continuous 240 Hz ink)`,
  );
  // Fill localStorage to within a few KB of quota, then draw one more stroke.
  const filled = await page.evaluate(() => {
    let i = 0,
      bytes = 0;
    for (const size of [256 * 1024, 16 * 1024, 1024]) {
      const chunk = "x".repeat(size);
      for (;;) {
        try {
          localStorage.setItem("review-fill-" + i, chunk);
          i++;
          bytes += size;
        } catch {
          break;
        }
      }
    }
    return { chunks: i, bytes };
  });
  console.log("filler written:", JSON.stringify(filled));
  const before = await page.evaluate(() => localStorage.getItem("incant-drawing-v2"));
  const prePng = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.mouse.move(r.x + r.width * 0.2, r.y + r.height * 0.7);
  await page.mouse.down();
  for (let i = 1; i <= 60; i++)
    await page.mouse.move(r.x + r.width * (0.2 + i / 100), r.y + r.height * 0.7);
  await page.mouse.up();
  const pixels = await canvas.evaluate((c: HTMLCanvasElement) => {
    const ctx = c.getContext("2d")!;
    return ctx.getImageData(Math.floor(c.width * 0.5), Math.floor(c.height * 0.7), 1, 1).data[0];
  });
  const after = await page.evaluate(() => localStorage.getItem("incant-drawing-v2"));
  const postPng = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.waitForTimeout(1200); // let the 500 ms draft archive run
  // Persist both PNGs across the reload via sessionStorage-free route: keep them in the test process.
  await page.addInitScript(
    ([pre, post]) => {
      (window as any).__preQuotaPng = pre;
      (window as any).__postQuotaPng = post;
    },
    [prePng, postPng],
  );
  await page.waitForTimeout(300);
  const message = (await page.locator(".room-message").count())
    ? await page.locator(".room-message").innerText()
    : "";
  console.log("second stroke visible on canvas:", pixels < 100, "| draft changed:", before !== after);
  console.log("room message:", JSON.stringify(message.trim()));
  await page.reload();
  const strokesAfterReload = await page.evaluate(
    () => JSON.parse(localStorage.getItem("incant-drawing-v2") || "[]").length,
  );
  const pixelsAfterReload = await canvas.evaluate((c: HTMLCanvasElement) => {
    const ctx = c.getContext("2d")!;
    return ctx.getImageData(Math.floor(c.width * 0.5), Math.floor(c.height * 0.7), 1, 1).data[0];
  });
  console.log("strokes after reload:", strokesAfterReload, "| second stroke survives reload:", pixelsAfterReload < 100);
  // The IndexedDB archive received the post-quota PNG (archiveSketch does not
  // depend on localStorage). Does that copy survive the reload's draft re-save?
  await page.waitForTimeout(1500);
  const archived = await page.evaluate(async () => {
    const a = await import("/src/lib/archive.ts");
    const pairs = await a.allPairs();
    const current = await a.meta("current");
    const pair = pairs.find((p: any) => p.id === current) || pairs[pairs.length - 1];
    return { pairs: pairs.length, sketch: pair?.sketch || "" };
  });
  const postQuotaPng = await page.evaluate(() => (window as any).__postQuotaPng);
  console.log(
    "archive pairs:", archived.pairs,
    "| archived sketch equals post-quota ink:", archived.sketch === postQuotaPng,
    "| archived sketch equals stale (pre-quota) ink:", archived.sketch === (await page.evaluate(() => (window as any).__preQuotaPng)),
  );
  expect(pixels).toBeLessThan(100);
  // Oracle: ink drawn after the quota hit should still be recoverable after reload.
  expect(pixelsAfterReload).toBeLessThan(100);
});
