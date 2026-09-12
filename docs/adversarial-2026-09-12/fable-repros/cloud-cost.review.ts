import { test, expect } from "@playwright/test";
// R-07: cloud backup rescans and rehashes every stored pair (all image bytes)
// every 15 s and after every stroke pause; every synced draft revision is an
// immutable manifest, and restore turns each revision into a separate row.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("incant-introduction-v1", "seen"),
  );
});
test("steady-state sync cost with a modest spellbook, and restore fan-out", async ({
  page,
}) => {
  const objects = new Map<string, string>(),
    snapshots = new Map<string, any>();
  let statusCalls = 0;
  await page.route("**/api/backup/**", async (r) => {
    const path = new URL(r.request().url()).pathname.split("/").slice(3);
    if (path[0] === "status") {
      statusCalls++;
      return r.fulfill({
        json: { objects: [...objects.keys()], snapshots: [...snapshots.keys()] },
      });
    }
    if (r.request().method() === "PUT") {
      const data = r.request().postDataJSON();
      if (path[0] === "objects") objects.set(path[1], data.data);
      else snapshots.set(path[1], data);
      return r.fulfill({ json: { ok: true } });
    }
    return r.fulfill({
      json:
        path[0] === "objects"
          ? { data: objects.get(path[1]) }
          : [...snapshots.values()],
    });
  });
  await page.goto("/");
  // 40 sealed pairs, each with a 60 KB sketch and two 1.5 MB images (realistic
  // gpt-image PNG size), i.e. about 120 MB of base64 in IndexedDB.
  const seeded = await page.evaluate(async () => {
    const a = await import("/src/lib/archive.ts");
    const big = "data:image/png;base64," + "A".repeat(1_500_000);
    const small = "data:image/png;base64," + "B".repeat(60_000);
    for (let i = 0; i < 40; i++) {
      const p = await a.archiveSketch(small + i, "spell " + i, true);
      await a.archiveImage(p.id, { id: "img-a-" + i, image: big + "a" + i, spell: "spell " + i });
      await a.archiveImage(p.id, { id: "img-b-" + i, image: big + "b" + i, spell: "spell " + i });
      await a.endPage();
    }
    return (await a.allPairs()).length;
  });
  console.log("seeded pairs:", seeded);
  const first = await page.evaluate(async () => {
    const c = await import("/src/lib/cloud-backup.ts");
    const t = performance.now();
    await c.syncCloud();
    return Math.round(performance.now() - t);
  });
  console.log("first sync (uploads everything) ms:", first, "objects:", objects.size, "snapshots:", snapshots.size);
  const steady: number[] = [];
  for (let i = 0; i < 3; i++)
    steady.push(
      await page.evaluate(async () => {
        const c = await import("/src/lib/cloud-backup.ts");
        const t = performance.now();
        await c.syncCloud();
        return Math.round(performance.now() - t);
      }),
    );
  console.log("steady-state sync with nothing new to upload, ms per run:", steady);
  // Now a single page edited over time: 6 draft revisions, each synced (as the
  // 15 s timer / 2 s debounce would do while the user pauses).
  await page.evaluate(async () => {
    const a = await import("/src/lib/archive.ts"),
      c = await import("/src/lib/cloud-backup.ts");
    for (let i = 0; i < 6; i++) {
      await a.archiveSketch("data:image/png;base64,rev" + i, "same page", false);
      await c.syncCloud();
    }
  });
  const snapshotsForPage = [...snapshots.values()].filter((s) => s.spell === "same page").length;
  const restored = await page.evaluate(async () => {
    const a = await import("/src/lib/archive.ts"),
      c = await import("/src/lib/cloud-backup.ts");
    const before = (await a.allPairs()).length;
    await c.restoreCloud();
    const pairs = await a.allPairs();
    return { before, after: pairs.length, samePage: pairs.filter((p) => p.spell === "same page").length };
  });
  console.log("snapshots stored for one edited page:", snapshotsForPage, "| restore:", JSON.stringify(restored));
  // Oracles for the two risks: idle sync should be cheap, and one page should restore as one row.
  expect(Math.max(...steady)).toBeLessThan(250);
  expect(restored.samePage).toBe(2); // the local row plus one restored copy
});
