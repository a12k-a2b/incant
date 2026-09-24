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
      if (name.startsWith("Sketch Magic-"))
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

test("an uncast moon sketch can be viewed and downloaded without replacing the next draft", async ({
  page,
}) => {
  await page.goto("/?mode=desk");
  const archivedSketch = await line(page);
  await page.getByRole("button", { name: "New spell — turn the moon" }).click();
  await expect(page.locator(".turning-moon")).toHaveCount(0, { timeout: 8000 });
  const canvas = page.locator("canvas"),
    bounds = await canvas.boundingBox();
  await page.mouse.move(
    bounds!.x + bounds!.width * 0.2,
    bounds!.y + bounds!.height * 0.7,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds!.x + bounds!.width * 0.8,
    bounds!.y + bounds!.height * 0.7,
  );
  await page.mouse.up();
  await page.waitForTimeout(700);
  const before = await page.evaluate(async (expectedSketch) => {
    const path = "/src/lib/archive.ts",
      a = await import(path),
      pairs = await a.allPairs();
    return {
      current: await a.meta("current"),
      archived: pairs.find((pair: any) => pair.sketch === expectedSketch),
    };
  }, archivedSketch);
  expect(before.archived.images).toEqual([]);

  await page.getByRole("button", { name: "Open saved spells" }).click();
  const archivedArticle = page
    .getByRole("article", { name: "Sketch bundle" })
    .filter({ has: page.locator(`img[src="${archivedSketch}"]`) });
  await archivedArticle.getByRole("button", { name: "View sketch" }).click();
  await expect(
    archivedArticle.getByRole("img", { name: "Full-size saved sketch" }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await archivedArticle.getByRole("button", { name: "Save sketch" }).click();
  expect((await download).suggestedFilename()).toMatch(
    /^sketch-magic-sketch-.*\.png$/,
  );
  expect(
    await page.evaluate(async () => {
      const path = "/src/lib/archive.ts";
      return (await import(path)).meta("current");
    }),
  ).toBe(before.current);
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

test("a newer durable draft survives localStorage quota and cannot be replaced by stale hydration", async ({
  page,
}) => {
  await page.goto("/");
  const canvas = page.locator("canvas"),
    bounds = await canvas.boundingBox();
  await page.mouse.move(
    bounds!.x + bounds!.width * 0.2,
    bounds!.y + bounds!.height * 0.3,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds!.x + bounds!.width * 0.8,
    bounds!.y + bounds!.height * 0.3,
  );
  await page.mouse.up();
  await page.waitForTimeout(300);
  const stale = await page.evaluate(() =>
    localStorage.getItem("incant-drawing-v2"),
  );
  await page.evaluate(() => {
    let index = 0;
    for (const size of [256 * 1024, 16 * 1024, 1024, 64, 8, 1]) {
      const chunk = "x".repeat(size);
      for (;;) {
        try {
          localStorage.setItem(`quota-fill-${index++}`, chunk);
        } catch {
          break;
        }
      }
    }
  });
  await page.mouse.move(
    bounds!.x + bounds!.width * 0.2,
    bounds!.y + bounds!.height * 0.7,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds!.x + bounds!.width * 0.8,
    bounds!.y + bounds!.height * 0.7,
  );
  await page.mouse.up();
  const postQuota = await canvas.evaluate((node: HTMLCanvasElement) =>
    node.toDataURL(),
  );
  expect(
    await page.evaluate(() => localStorage.getItem("incant-drawing-v2")),
  ).toBe(stale);
  await page.waitForTimeout(1200);

  await page.reload();
  await expect
    .poll(() =>
      canvas.evaluate((node: HTMLCanvasElement) => {
        const context = node.getContext("2d")!;
        return context.getImageData(
          Math.floor(node.width * 0.5),
          Math.floor(node.height * 0.7),
          1,
          1,
        ).data[0];
      }),
    )
    .toBeLessThan(100);
  await page.waitForTimeout(800);
  const archived = await page.evaluate(async () => {
    const path = "/src/lib/archive.ts",
      a = await import(path),
      current = await a.meta("current"),
      pairs = await a.allPairs();
    return pairs.find((pair: any) => pair.id === current)?.sketch;
  });
  expect(archived).toBe(postQuota);
});

test("a newer committed fallback repairs an older durable draft after IndexedDB recovers", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const path = "/src/lib/durable-draft.ts",
      drafts = await import(path),
      first = {
        drawing: [{ eraser: false, points: [{ x: 0.1, y: 0.1, p: 0.5 }] }],
        size: { w: 1024, h: 1536 },
        revision: 100,
      },
      second = {
        drawing: [{ eraser: false, points: [{ x: 0.8, y: 0.8, p: 0.5 }] }],
        size: { w: 1024, h: 1536 },
        revision: 101,
      };
    await drafts.saveDurableDraft(first);
    const realOpen = indexedDB.open.bind(indexedDB);
    (indexedDB as any).open = () => {
      throw new DOMException("synthetic IndexedDB outage", "UnknownError");
    };
    await drafts.saveDurableDraft(second);
    (indexedDB as any).open = realOpen;
    const recovered = await drafts.loadDurableDraft();
    localStorage.removeItem("incant-drawing-v2-snapshot");
    const repaired = await drafts.loadDurableDraft();
    return { recovered, repaired };
  });
  expect(result.recovered).toEqual(result.repaired);
  expect(result.recovered).toMatchObject({
    revision: 101,
    drawing: [{ points: [{ x: 0.8, y: 0.8 }] }],
  });
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

test("historical recasts retain their source bundle and never steal the current draft", async ({
  page,
}) => {
  await page.goto("/");
  const first = await page.evaluate(async () => {
    const path = "/src/lib/archive.ts",
      a = await import(path);
    const sourceSketch = "data:image/png;base64,AQID",
      sourceImage = "data:image/png;base64,BAUG",
      draftSketch = "data:image/png;base64,BwgJ";
    const original = await a.archiveSketch(sourceSketch, "original", true, 10);
    await a.archiveImage(original.id!, {
      id: "source-a",
      image: sourceImage,
      spell: "original",
    });
    await a.endPage();
    const draft = await a.archiveSketch(draftSketch, "unfinished B", false, 20);
    const recast = await a.archiveCast(
      sourceSketch,
      "recast A",
      {
        id: "source-a",
        image: sourceImage,
        spell: "original",
        created: 10,
        archivePairId: original.id,
        archiveBundleId: original.bundleId,
      },
      30,
    );
    await a.archiveImage(recast.id!, {
      id: "source-a-recast-1",
      image: "data:image/png;base64,CgsM",
      spell: "recast A",
    });
    return {
      original,
      draft,
      current: await a.meta("current"),
      pairs: await a.allPairs(),
    };
  });
  expect(first.current).toBe(first.draft.id);
  expect(first.pairs.find((p: any) => p.id === first.draft.id)).toMatchObject({
    sketch: "data:image/png;base64,BwgJ",
    spell: "unfinished B",
    sealed: false,
    images: [],
  });
  const original = first.pairs.find((p: any) => p.id === first.original.id);
  expect(original.bundleId).toBe(first.original.bundleId);
  expect(original.images.map((image: any) => image.id)).toEqual([
    "source-a",
    "source-a-recast-1",
  ]);

  await page.reload();
  const repeated = await page.evaluate(async () => {
    const path = "/src/lib/archive.ts",
      a = await import(path),
      rows = await a.allPairs(),
      source = rows.find((pair: any) =>
        pair.images.some((image: any) => image.id === "source-a-recast-1"),
      )!;
    const pair = await a.archiveCast(
      source.sketch,
      "repeat recast A",
      {
        id: "source-a-recast-1",
        image: "data:image/png;base64,CgsM",
        spell: "recast A",
        archivePairId: source.id,
        archiveBundleId: source.bundleId,
      },
      40,
    );
    await a.archiveImage(pair.id!, {
      id: "source-a-recast-2",
      image: "data:image/png;base64,DQ4P",
      spell: "repeat recast A",
    });
    return { current: await a.meta("current"), pairs: await a.allPairs() };
  });
  expect(repeated.current).toBe(first.draft.id);
  expect(
    repeated.pairs.find((p: any) => p.id === first.draft.id),
  ).toMatchObject({
    sketch: "data:image/png;base64,BwgJ",
    spell: "unfinished B",
    sealed: false,
    images: [],
  });
  expect(
    repeated.pairs
      .find((p: any) => p.id === first.original.id)
      .images.map((image: any) => image.id),
  ).toEqual(["source-a", "source-a-recast-1", "source-a-recast-2"]);
});

test("concurrent fourfold archive writes retain every distinct generation once", async ({
  page,
}) => {
  await page.goto("/");
  const images = await page.evaluate(async () => {
    const path = "/src/lib/archive.ts",
      a = await import(path),
      pair = await a.archiveSketch("fourfold-source", "fourfold", true);
    await Promise.all([
      ...["one", "two", "three", "four"].map((id) =>
        a.archiveImage(pair.id, { id, image: `image-${id}`, spell: id }),
      ),
      a.archiveImage(pair.id, {
        id: "two",
        image: "duplicate-two",
        spell: "duplicate",
      }),
    ]);
    return (await a.allPairs())[0].images;
  });
  expect(images.map((image: any) => image.id).sort()).toEqual([
    "four",
    "one",
    "three",
    "two",
  ]);
  expect(images.find((image: any) => image.id === "two").image).toBe(
    "image-two",
  );
});

test("a recast bootstraps a legacy generation without racing draft ownership", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const path = "/src/lib/archive.ts",
      a = await import(path),
      draft = await a.archiveSketch("draft", "unfinished", false, 10),
      legacy = {
        id: "legacy-source",
        image: "legacy-image",
        sketch: "legacy-sketch",
        spell: "old spell",
        created: 5,
      };
    const pair = await a.archiveCast(legacy.sketch, "new spell", legacy, 20);
    await a.archiveExisting([legacy]);
    return {
      pair,
      draft,
      current: await a.meta("current"),
      pairs: await a.allPairs(),
    };
  });
  expect(result.current).toBe(result.draft.id);
  expect(result.pairs).toHaveLength(2);
  expect(
    result.pairs.filter((p: any) =>
      p.images.some((image: any) => image.id === "legacy-source"),
    ),
  ).toHaveLength(1);
  expect(result.pair.bundleId).toBe("legacy-legacy-source");
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
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("incant-introduction-v1", "seen"),
  );
});
