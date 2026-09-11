import { test, expect } from "@playwright/test";
test("offline retry backs up exact bytes, resumes idempotently and restores without replacing a draft", async ({
  page,
}) => {
  const objects = new Map<string, string>(),
    snapshots = new Map<string, any>();
  let failing = true,
    writes = 0;
  await page.route("**/api/backup/**", async (r) => {
    const path = new URL(r.request().url()).pathname.split("/").slice(3);
    if (failing) {
      await r.fulfill({ status: 503, json: {} });
      return;
    }
    if (path[0] === "status") {
      await r.fulfill({
        json: {
          objects: [...objects.keys()],
          snapshots: [...snapshots.keys()],
        },
      });
      return;
    }
    if (r.request().method() === "PUT") {
      writes++;
      const data = r.request().postDataJSON();
      if (path[0] === "objects") objects.set(path[1], data.data);
      else snapshots.set(path[1], data);
      await r.fulfill({ json: { ok: true } });
      return;
    }
    await r.fulfill({
      json:
        path[0] === "objects"
          ? { data: objects.get(path[1]) }
          : [...snapshots.values()],
    });
  });
  await page.goto("/");
  await page.evaluate(async () => {
    const path = "/src/lib/archive.ts";
    const a = await import(path);
    const p = await a.archiveSketch("data:image/png;base64,AQID", "warm", true);
    await a.archiveImage(p.id, {
      id: "warm",
      image: "data:image/png;base64,BAUG",
      spell: "warm",
    });
    await a.archiveImage(p.id, {
      id: "cold",
      image: "data:image/png;base64,BwgJ",
      spell: "cold",
    });
    const c = "/src/lib/cloud-backup.ts";
    await (await import(c)).syncCloud();
  });
  expect(snapshots.size).toBe(0);
  failing = false;
  const sync = () =>
    page.evaluate(async () => {
      const c = "/src/lib/cloud-backup.ts";
      await (await import(c)).syncCloud();
    });
  await sync();
  expect(objects.size).toBe(3);
  expect(snapshots.size).toBe(1);
  const firstWrites = writes;
  await sync();
  expect(writes).toBe(firstWrites);
  expect([...objects.values()].sort()).toEqual(
    [
      "data:image/png;base64,AQID",
      "data:image/png;base64,BAUG",
      "data:image/png;base64,BwgJ",
    ].sort(),
  );
  const restored = await page.evaluate(async () => {
    const path = "/src/lib/archive.ts",
      c = "/src/lib/cloud-backup.ts";
    const a = await import(path),
      b = await import(c);
    await a.endPage();
    await a.archiveSketch("data:image/png;base64,CgsM", "current draft");
    await b.restoreCloud();
    await b.restoreCloud();
    return { pairs: await a.allPairs(), current: await a.meta("current") };
  });
  expect(restored.pairs).toHaveLength(3);
  expect(restored.pairs.find((p: any) => p.cloudKey).images).toHaveLength(2);
  expect(restored.pairs.find((p: any) => p.id === restored.current).spell).toBe(
    "current draft",
  );
});
