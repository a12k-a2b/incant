import { test, expect } from "@playwright/test";
async function line(page: any) {
  const c = page.locator("canvas"),
    r = await c.boundingBox();
  await page.mouse.move(r.x + r.width * 0.35, r.y + r.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width * 0.65, r.y + r.height * 0.5);
  await page.mouse.up();
  return c.evaluate((c: HTMLCanvasElement) => c.toDataURL());
}
test("archive preserves exact sealed source and numbered pairing through edits and reload", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const path = "/src/lib/archive.ts";
    const a = await import(path);
    const png = "data:image/png;base64,AQID";
    let p = await a.archiveSketch(png, "first");
    const id = p.id;
    p = await a.archiveSketch(png + "BA==", "edit");
    const updated = p.id;
    await a.archiveSketch(png + "BA==", "cast", true);
    await a.archiveImage(id, { id: "image-a", image: png, spell: "cast" });
    await a.archiveImage(id, { id: "image-a", image: png, spell: "cast" });
    const next = await a.archiveSketch(png, "new edit");
    return { id, updated, next: next.id, pairs: await a.allPairs() };
  });
  expect(result.id).toBe(result.updated);
  expect(result.next).toBeGreaterThan(result.id);
  expect(result.pairs[0].images).toHaveLength(1);
  expect(result.pairs[0].sketch).toBe("data:image/png;base64,AQIDBA==");
  await page.reload();
  expect(
    await page.evaluate(async () => {
      const path = "/src/lib/archive.ts";
      return (await (await import(path)).allPairs()).length;
    }),
  ).toBe(2);
});
test("moon saves automatically without a popup; file export is optional", async ({
  page,
}) => {
  // OPFS exercises real browser file handles but is NOT user-visible Android Files evidence.
  await page.addInitScript(() => {
    (window as any).showDirectoryPicker = () =>
      navigator.storage.getDirectory();
  });
  await page.goto("/?mode=desk");
  const original = await line(page);
  await page.getByRole("button", { name: "New spell — turn the moon" }).click();
  await expect(
    page.getByRole("dialog", { name: "Keep your spell pairs" }),
  ).not.toBeVisible();
  await expect(page.locator(".turning-moon")).toBeVisible();
  await expect(page.locator(".day-cycle")).toBeVisible();
  await expect(page.locator(".turning-moon")).toHaveCount(0, { timeout: 8000 });
  expect(
    await page
      .locator("canvas")
      .evaluate((c: HTMLCanvasElement) => c.toDataURL()),
  ).not.toBe(original);
  await page
    .getByRole("button", { name: "Open desk tools", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Export spellbook", exact: true })
    .click();
  await page.getByRole("button", { name: "Choose export folder" }).click();
  await expect(
    page.getByRole("dialog", { name: "Keep your spell pairs" }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Close desk tools" }).click();
  const files = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const result: any = {};
    for await (const [name, handle] of (root as any).entries()) {
      if (name.startsWith("Incant-"))
        for await (const [file, h] of handle.entries()) {
          result[file] = Array.from(
            new Uint8Array(await (await h.getFile()).arrayBuffer()),
          );
        }
    }
    return result;
  });
  expect(files["pair-0001-sketch.png"]).toEqual(
    Array.from(Buffer.from(original.split(",")[1], "base64")),
  );
  await line(page);
  await page.getByRole("button", { name: "New spell — turn the moon" }).click();
  await expect(page.locator(".turning-moon")).toBeVisible();
});
test("folder denial cannot clear the sketch", async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).showDirectoryPicker = () =>
      Promise.reject(new DOMException("Folder denied", "NotAllowedError"));
  });
  await page.goto("/?mode=desk");
  const original = await line(page);
  await page
    .getByRole("button", { name: "Open desk tools", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Export spellbook", exact: true })
    .click();
  await page.getByRole("button", { name: "Choose export folder" }).click();
  await expect(page.getByRole("alert")).toContainText("Folder denied");
  await expect(page.locator(".turning-moon")).toHaveCount(0);
  expect(
    await page
      .locator("canvas")
      .evaluate((c: HTMLCanvasElement) => c.toDataURL()),
  ).toBe(original);
});
test("archive failure cannot clear the sketch", async ({ page }) => {
  await page.goto("/");
  const original = await line(page);
  await page.evaluate(() => {
    indexedDB.open = () => {
      throw new DOMException("Storage is full", "QuotaExceededError");
    };
  });
  await page.getByRole("button", { name: "New spell — turn the moon" }).click();
  await expect(page.getByRole("alert")).toContainText("not been cleared");
  expect(
    await page
      .locator("canvas")
      .evaluate((c: HTMLCanvasElement) => c.toDataURL()),
  ).toBe(original);
});

test("old gallery casts backfill once without stealing the active page", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const path = "/src/lib/archive.ts",
      a = await import(path),
      png = "data:image/png;base64,AQID";
    const draft = await a.archiveSketch(png, "draft");
    const old = { id: "legacy", sketch: png, image: png, spell: "old" };
    await a.archiveExisting([old]);
    await a.archiveExisting([old]);
    const updated = await a.archiveSketch(png, "still draft");
    return { draft: draft.id, updated: updated.id, pairs: await a.allPairs() };
  });
  expect(result.draft).toBe(result.updated);
  expect(result.pairs).toHaveLength(2);
  expect(result.pairs[1].images[0].id).toBe("legacy");
});

test("unresponsive native picker recovers without clearing", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).showDirectoryPicker = () => new Promise(() => {});
  });
  await page.goto("/?mode=desk");
  const original = await line(page);
  await page.clock.install();
  await page
    .getByRole("button", { name: "Open desk tools", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Export spellbook", exact: true })
    .click();
  await page.getByRole("button", { name: "Choose export folder" }).click();
  await page.clock.runFor(31000);
  await expect(page.getByRole("alert")).toContainText("did not respond");
  await expect(
    page.getByRole("button", { name: "Keep drawing" }),
  ).toBeEnabled();
  expect(
    await page
      .locator("canvas")
      .evaluate((c: HTMLCanvasElement) => c.toDataURL()),
  ).toBe(original);
});
test("named frames persist while keeping the drawing", async ({ page }) => {
  await page.goto("/?frame=big");
  await expect(page.locator("main")).toHaveAttribute("data-frame", "big");
  await line(page);
  const draft = await page.evaluate(() =>
    localStorage.getItem("incant-drawing-v2"),
  );
  expect(JSON.parse(draft!)).not.toHaveLength(0);
  await page.goto("/?frame=balanced");
  await expect(page.locator("main")).toHaveAttribute("data-frame", "balanced");
  await page.goto("/");
  await expect(page.locator("main")).toHaveAttribute("data-frame", "balanced");
  expect(
    await page.evaluate(() => localStorage.getItem("incant-drawing-v2")),
  ).toBe(draft);
});

test("different spells reuse the exact sketch and archive both results", async ({
  page,
}) => {
  await page.goto("/");
  const original = await line(page),
    sent: any[] = [];
  await page.route("**/api/cast", async (r) => {
    sent.push(r.request().postDataJSON());
    await r.fulfill({
      json: {
        ok: true,
        imageBase64: original.split(",")[1],
        mime: "image/png",
      },
    });
  });
  for (const words of ["Hot weather", "Cold weather"]) {
    await page
      .getByRole("button", { name: "Type a spell", exact: true })
      .click();
    await page.getByLabel("Type your spell").fill(words);
    await page.getByRole("button", { name: "Cast typed spell" }).click();
    await expect(page.locator(".manifestation.image-ready")).toBeVisible();
    await expect(page.locator(".spell-fog")).toHaveCount(0, { timeout: 6000 });
  }
  expect(sent.map((s) => s.incantation)).toEqual([
    "Hot weather",
    "Cold weather",
  ]);
  expect(sent[0].sketchPngBase64).toBe(sent[1].sketchPngBase64);
  const pairs = await page.evaluate(async () => {
    const path = "/src/lib/archive.ts";
    return (await import(path)).allPairs();
  });
  expect(pairs).toHaveLength(1);
  expect(pairs[0].images.map((i: any) => i.spell)).toEqual([
    "Hot weather",
    "Cold weather",
  ]);
});

test("sessions group activity, preserve revision bundles, and separate new pages after inactivity", async ({
  page,
}) => {
  await page.goto("/");
  const p = await page.evaluate(async () => {
    const path = "/src/lib/archive.ts",
      a = await import(path),
      t = new Date(2026, 8, 11, 18).getTime();
    const one = await a.archiveSketch("one", "hot", true, t);
    const revision = await a.archiveSketch("two", "cold", true, t + 1000);
    await a.endPage();
    const second = await a.archiveSketch("three", "party", true, t + 60000);
    await a.endPage();
    const later = await a.archiveSketch(
      "four",
      "later",
      true,
      t + 60000 + a.SESSION_GAP_MS + 1,
    );
    return { one, revision, second, later };
  });
  expect(p.one.bundleId).toBe(p.revision.bundleId);
  expect(p.second.bundleId).not.toBe(p.one.bundleId);
  expect(p.second.sessionId).toBe(p.one.sessionId);
  expect(p.later.sessionId).not.toBe(p.one.sessionId);
  expect(p.later.day).toBe("2026-09-11");
  await page.reload();
  const stored = await page.evaluate(async () => {
    const path = "/src/lib/archive.ts";
    return (await import(path)).allPairs();
  });
  expect(stored).toHaveLength(4);
  expect(stored[0].bundleId).toBe(p.one.bundleId);
});

test("foreground frame is 90 percent and See-through is a persistent rollback", async ({
  page,
}) => {
  await page.goto("/?layer=foreground");
  await expect(page.locator("main")).toHaveAttribute(
    "data-frame-layer",
    "foreground",
  );
  expect(
    await page
      .locator(".paper-wrap")
      .evaluate((e) => getComputedStyle(e, "::after").opacity),
  ).toBe("0.9");
  await page.goto("/?layer=see-through");
  await page.reload();
  await expect(page.locator("main")).toHaveAttribute(
    "data-frame-layer",
    "see-through",
  );
  expect(
    await page
      .locator(".paper-wrap")
      .evaluate((e) => getComputedStyle(e, "::after").opacity),
  ).toBe("1");
});
test("a session can cross midnight while sketches remain grouped by their local creation day", async ({
  page,
}) => {
  await page.goto("/");
  const p = await page.evaluate(async () => {
    const path = "/src/lib/archive.ts",
      a = await import(path),
      t = new Date(2026, 8, 11, 23, 50).getTime();
    const before = await a.archiveSketch("before", "", false, t);
    await a.endPage();
    const after = await a.archiveSketch("after", "", false, t + 20 * 60000);
    return { before, after };
  });
  expect(p.before.sessionId).toBe(p.after.sessionId);
  expect(p.before.day).toBe("2026-09-11");
  expect(p.after.day).toBe("2026-09-12");
});

// These existing flows exercise a returning user; first-visit behavior has its own suite.
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem("incant-introduction-v1", "seen")); });
