import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("incant-introduction-v1", "seen"),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Dragon settings" }),
  ).toBeEnabled();
});

test("coalesced input reads layout once per batch and preserves the pen-up endpoint", async ({
  page,
}) => {
  const result = await page
    .locator("canvas")
    .evaluate((node: HTMLCanvasElement) => {
      const rect = node.getBoundingClientRect();
      // Synthetic delivery tests acquisition, not hardware sampling or latency.
      node.setPointerCapture = () => {};
      let reads = 0;
      const bounds = node.getBoundingClientRect.bind(node);
      node.getBoundingClientRect = () => {
        reads++;
        return bounds();
      };
      const event = (type: string, x: number) =>
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 71,
          pointerType: "pen",
          button: type === "pointermove" ? -1 : 0,
          buttons: type === "pointerup" ? 0 : 1,
          pressure: type === "pointerup" ? 0 : 0.5,
          clientX: rect.left + rect.width * x,
          clientY: rect.top + rect.height * 0.5,
        });
      node.dispatchEvent(event("pointerdown", 0.2));
      reads = 0;
      const move = event("pointermove", 0.6);
      Object.defineProperty(move, "getCoalescedEvents", {
        value: () =>
          Array.from({ length: 40 }, (_, i) =>
            event("pointermove", 0.21 + i / 100),
          ),
      });
      node.dispatchEvent(move);
      const batchReads = reads;
      node.dispatchEvent(event("pointerup", 0.8));
      const at = (x: number) =>
        node
          .getContext("2d")!
          .getImageData(
            Math.floor(node.width * x),
            Math.floor(node.height * 0.5),
            1,
            1,
          ).data[0];
      return { batchReads, middle: at(0.4), endpoint: at(0.79) };
    });
  expect(result.middle).toBeLessThan(100);
  expect.soft(result.endpoint).toBeLessThan(100);
  expect.soft(result.batchReads).toBeLessThanOrEqual(1);
});

test("an interrupted stroke is committed and the next stroke is accepted", async ({
  page,
}) => {
  const canvas = page.locator("canvas"),
    box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.mouse.up();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6);
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const path = "/src/lib/durable-draft.ts";
        return (await (await import(path)).loadDurableDraft())?.drawing.length;
      }),
    )
    .toBe(2);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Dragon settings" }),
  ).toBeEnabled();
  const pixels = await canvas.evaluate((node: HTMLCanvasElement) =>
    [0.4, 0.6].map(
      (y) =>
        node
          .getContext("2d")!
          .getImageData(
            Math.floor(node.width * 0.5),
            Math.floor(node.height * y),
            1,
            1,
          ).data[0],
    ),
  );
  expect(pixels.every((value) => value < 100)).toBe(true);
});

test("durable IDB commits during contact while compatibility serialization waits and coalesces", async ({
  page,
}) => {
  const saved = await page.evaluate(async () => {
    const draftPath = "/src/lib/durable-draft.ts",
      activityPath = "/src/lib/ink-activity.ts";
    const drafts = await import(draftPath),
      activity = await import(activityPath);
    (window as any).inkOwner = {};
    activity.setInkContact((window as any).inkOwner, true);
    const make = (revision: number) => ({
      drawing: [{ eraser: false, points: [{ x: 0.5, y: 0.5, p: 0.5 }] }],
      size: { w: 1024, h: 1536 },
      revision,
    });
    await drafts.saveDurableDraft(make(10));
    await drafts.saveDurableDraft(make(11));
    return {
      draft: await drafts.loadDurableDraft(),
      mirror: localStorage.getItem("incant-drawing-v2-snapshot"),
    };
  });
  expect(saved.draft.revision).toBe(11);
  expect(saved.mirror).toBeNull();
  await page.waitForTimeout(250);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("incant-drawing-v2-snapshot"),
    ),
  ).toBeNull();
  await page.evaluate(async () => {
    const path = "/src/lib/ink-activity.ts";
    (await import(path)).setInkContact((window as any).inkOwner, false);
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("incant-drawing-v2-snapshot") || "null",
          )?.revision,
      ),
    )
    .toBe(11);
});

test("background preview waits until the ongoing stroke ends", async ({
  page,
}) => {
  const canvas = page.locator("canvas"),
    box = (await canvas.boundingBox())!;
  await page.evaluate(() => {
    (window as any).inkExports = 0;
    const original = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      (window as any).inkExports++;
      return original.apply(this, args);
    };
  });
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4);
  await page.mouse.up();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6);
  await page.waitForTimeout(1100); // Cross the 500ms archive debounce while contact stays active.
  expect(await page.evaluate(() => (window as any).inkExports)).toBe(0);
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => (window as any).inkExports))
    .toBeGreaterThan(0);
});

test("legacy revision discovery happens once; subsequent saves serialize the drawing once", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const path = "/src/lib/durable-draft.ts",
      drafts = await import(path);
    const make = (revision: number) => ({
      drawing: Array.from({ length: 200 }, () => ({
        eraser: false,
        points: Array.from({ length: 150 }, (_, i) => ({
          x: i / 150,
          y: 0.5,
          p: 0.5,
        })),
      })),
      size: { w: 1024, h: 1536 },
      revision,
    });
    const old = make(20);
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("incant-draft-v1", 1);
      req.onsuccess = () => {
        const db = req.result,
          tx = db.transaction("drafts", "readwrite"),
          store = tx.objectStore("drafts");
        store.put(old, "current");
        store.delete("revision");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
    let fullReads = 0,
      largeStringifies = 0;
    const get = IDBObjectStore.prototype.get,
      stringify = JSON.stringify;
    IDBObjectStore.prototype.get = function (key) {
      if (this.name === "drafts" && key === "current") fullReads++;
      return get.call(this, key);
    };
    (JSON as any).stringify = function (value: any, ...args: any[]) {
      const result = (stringify as any)(value, ...args);
      if (result?.length > 100000) largeStringifies++;
      return result;
    };
    try {
      await drafts.saveDurableDraft(make(19));
      const migrationReads = fullReads;
      fullReads = 0;
      await drafts.saveDurableDraft(make(21));
      const steadyReads = fullReads;
      return {
        migrationReads,
        steadyReads,
        largeStringifies,
        restored: (await drafts.loadDurableDraft()).revision,
      };
    } finally {
      IDBObjectStore.prototype.get = get;
      JSON.stringify = stringify;
    }
  });
  expect(result).toEqual({
    migrationReads: 1,
    steadyReads: 0,
    largeStringifies: 1,
    restored: 21,
  });
});

test("contact resumes without a hover bridge, but a true up ends the sequence", async ({
  page,
}) => {
  const pixels = await page
    .locator("canvas")
    .evaluate((node: HTMLCanvasElement) => {
      node.setPointerCapture = () => {};
      const r = node.getBoundingClientRect();
      const send = (type: string, x: number, buttons: number) =>
        node.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 81,
            pointerType: "pen",
            button: type === "pointermove" ? -1 : 0,
            buttons,
            pressure: buttons ? 0.5 : 0,
            clientX: r.left + r.width * x,
            clientY: r.top + r.height * 0.5,
            bubbles: true,
          }),
        );
      send("pointerdown", 0.2, 1);
      send("pointermove", 0.3, 1);
      send("pointermove", 0.4, 0);
      send("pointermove", 0.6, 1);
      send("pointermove", 0.8, 1);
      send("pointerup", 0.8, 0);
      send("pointermove", 0.9, 0);
      return [0.25, 0.45, 0.7, 0.9].map(
        (x) =>
          node
            .getContext("2d")!
            .getImageData(
              Math.floor(node.width * x),
              Math.floor(node.height * 0.5),
              1,
              1,
            ).data[0],
      );
    });
  expect(pixels[0]).toBeLessThan(100);
  expect(pixels[1]).toBe(255);
  expect(pixels[2]).toBeLessThan(100);
  expect(pixels[3]).toBe(255);
});
