import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
test("offline retry backs up exact bytes, resumes idempotently and restores without replacing a draft", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    (window as any).__digestCalls = 0;
    crypto.subtle.digest = (...args) => {
      (window as any).__digestCalls++;
      return digest(...args);
    };
  });
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
  await page.evaluate(() => ((window as any).__digestCalls = 0));
  await sync();
  expect(writes).toBe(firstWrites);
  expect(await page.evaluate(() => (window as any).__digestCalls)).toBe(1);
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

test("restore collapses draft revisions, retains sealed sources, and resists a stale retry", async ({
  page,
}) => {
  const hash = (value: string) =>
      createHash("sha256").update(value).digest("hex"),
    objects = new Map<string, string>(),
    object = (value: string) => {
      const id = hash(value);
      objects.set(id, value);
      return id;
    },
    draftRecords = Array.from({ length: 6 }, (_, index) => {
      const sketch = object(`data:image/png;base64,ZHJhZnQt${index}`);
      return {
        key: `draft-${index}`,
        device: "device-a",
        id: 1,
        bundleId: "bundle-a",
        created: 10,
        updated: 10 + index,
        sketch,
        spell: `draft ${index}`,
        sealed: false,
        images: [],
      };
    }),
    imageOne = object("data:image/png;base64,aW1hZ2UtMQ=="),
    imageTwo = object("data:image/png;base64,aW1hZ2UtMg=="),
    otherSketch = object("data:image/png;base64,b3RoZXItc2tldGNo"),
    otherImage = object("data:image/png;base64,b3RoZXItaW1hZ2U="),
    firstSealed = {
      ...draftRecords.at(-1)!,
      key: "sealed-a-1",
      updated: 20,
      spell: "sealed A",
      sealed: true,
      images: [{ id: "a-1", image: imageOne, spell: "sealed A", created: 20 }],
    },
    latestSealed = {
      ...firstSealed,
      key: "sealed-a-2",
      updated: 30,
      spell: "recast A",
      images: [
        ...firstSealed.images,
        { id: "a-2", image: imageTwo, spell: "recast A", created: 30 },
      ],
    },
    unsealedWithGeneration = {
      ...draftRecords[0],
      key: "historical-unsealed",
      spell: "draft with generation",
      images: [
        {
          id: "draft-generation",
          image: imageOne,
          spell: "draft with generation",
          created: 11,
        },
      ],
    },
    otherSealed = {
      key: "sealed-other",
      device: "device-a",
      id: 2,
      bundleId: "bundle-other",
      created: 40,
      updated: 40,
      sketch: otherSketch,
      spell: "other",
      sealed: true,
      images: [
        { id: "other-1", image: otherImage, spell: "other", created: 40 },
      ],
    };
  let records: any[] = [
    ...draftRecords,
    unsealedWithGeneration,
    firstSealed,
    latestSealed,
    otherSealed,
  ];
  await page.route("**/api/backup/**", async (route) => {
    const path = new URL(route.request().url()).pathname.split("/").slice(3);
    if (path[0] === "status") {
      await route.fulfill({ json: { objects: [], snapshots: [] } });
      return;
    }
    if (path[0] === "snapshots") {
      await route.fulfill({ json: records });
      return;
    }
    await route.fulfill({ json: { data: objects.get(path[1]) } });
  });
  await page.goto("/");
  const first = await page.evaluate(async () => {
    const archivePath = "/src/lib/archive.ts",
      backupPath = "/src/lib/cloud-backup.ts",
      a = await import(archivePath),
      b = await import(backupPath),
      draft = await a.archiveSketch("local-draft", "local B", false, 50);
    await b.restoreCloud();
    return {
      draft,
      current: await a.meta("current"),
      pairs: await a.allPairs(),
    };
  });
  expect(first.current).toBe(first.draft.id);
  const restored = first.pairs.filter((pair: any) => pair.cloudKey);
  expect(restored).toHaveLength(3);
  expect(
    restored.find((pair: any) =>
      pair.images.some((image: any) => image.id === "a-1"),
    ).images,
  ).toHaveLength(2);
  expect(
    restored.some(
      (pair: any) =>
        pair.images.length === 0 && pair.spell.startsWith("draft "),
    ),
  ).toBe(false);
  expect(
    restored.some((pair: any) =>
      pair.images.some((image: any) => image.id === "draft-generation"),
    ),
  ).toBe(true);

  records = [firstSealed, otherSealed];
  const staleRetry = await page.evaluate(async () => {
    const archivePath = "/src/lib/archive.ts",
      backupPath = "/src/lib/cloud-backup.ts",
      a = await import(archivePath),
      b = await import(backupPath);
    await b.restoreCloud();
    return { current: await a.meta("current"), pairs: await a.allPairs() };
  });
  expect(staleRetry.current).toBe(first.draft.id);
  expect(
    staleRetry.pairs
      .find(
        (pair: any) =>
          pair.cloudKey && pair.images.some((image: any) => image.id === "a-1"),
      )
      .images.map((image: any) => image.id),
  ).toEqual(["a-1", "a-2"]);

  const continuation = await page.evaluate(async () => {
    const archivePath = "/src/lib/archive.ts",
      a = await import(archivePath),
      rows = await a.allPairs(),
      restored = rows.find(
        (pair: any) =>
          pair.cloudKey && pair.images.some((image: any) => image.id === "a-1"),
      ),
      sourceImage = restored.images.find((image: any) => image.id === "a-2"),
      pair = await a.archiveCast(restored.sketch, "local continuation", {
        ...sourceImage,
        archivePairId: restored.id,
        archiveBundleId: restored.bundleId,
      });
    await a.archiveImage(pair.id, {
      id: "a-local",
      image: "data:image/png;base64,bG9jYWw=",
      spell: "local continuation",
    });
    return { current: await a.meta("current"), pairs: await a.allPairs() };
  });
  expect(continuation.current).toBe(first.draft.id);
  expect(
    continuation.pairs.find(
      (pair: any) =>
        pair.cloudKey && pair.images.some((image: any) => image.id === "a-1"),
    ).images,
  ).toHaveLength(2);
  const localContinuation = continuation.pairs.find(
    (pair: any) =>
      !pair.cloudKey &&
      pair.bundleId === "bundle-a" &&
      pair.images.some((image: any) => image.id === "a-local"),
  );
  expect(localContinuation.images.map((image: any) => image.id)).toEqual([
    "a-local",
  ]);
});

// These existing flows exercise a returning user; first-visit behavior has its own suite.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("incant-introduction-v1", "seen"),
  );
});
