import {
  allPairs,
  ensureArchiveRevision,
  meta,
  putMeta,
  importCloudPairs,
  type Pair,
} from "./archive";
export let backupStatus = "Checking cloud backup…";
type DigestCache = {
  revision: string;
  sourceHash: string;
  images: { id: string; hash: string }[];
};
function status(text: string) {
  backupStatus = text;
  window.dispatchEvent(new Event("incant-backup-status"));
}
async function digest(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
async function request(path: string, body?: unknown) {
  const r = await fetch("/api/backup/" + path, {
    method: body === undefined ? "GET" : "PUT",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok)
    throw new Error(
      r.status === 401
        ? "Unlock the room to resume backup."
        : r.status === 503
          ? "Cloud storage is unavailable. Your local copies remain saved."
          : "Cloud backup is waiting to retry. Your local copies remain saved.",
    );
  return r.json();
}
let running: Promise<void> | undefined;
export function syncCloud() {
  if (running) return running;
  running = (async () => {
    if (!navigator.onLine) {
      status("Offline · saved on this device; cloud backup will retry.");
      return;
    }
    let device = await meta<string>("cloud-device");
    if (!device) {
      device = crypto.randomUUID();
      await putMeta("cloud-device", device);
    }
    const index = await request("status");
    const savedSnapshots = new Set<string>(index.snapshots),
      savedObjects = new Set<string>(index.objects);
    const pairs = (await allPairs()).filter((p) => !p.cloudKey);
    let count = 0;
    // Content-addressed images upload once; immutable manifests retain prior versions.
    for (const pair of pairs) {
      const revision = pair.revision || (await ensureArchiveRevision(pair.id!)),
        cached = await meta<DigestCache>(`backup-digest:${pair.id}`),
        validCache =
          !!cached &&
          cached.revision === revision &&
          typeof cached.sourceHash === "string" &&
          Array.isArray(cached.images) &&
          cached.images.length === pair.images.length &&
          cached.images.every(
            (image, index) => image.id === pair.images[index].id,
          ),
        sourceHash = validCache
          ? cached!.sourceHash
          : await digest(pair.sketch),
        imageHashes = validCache
          ? cached!.images
          : await Promise.all(
              pair.images.map(async (image) => ({
                id: image.id,
                hash: await digest(image.image),
              })),
            ),
        images = pair.images.map((image, index) => ({
          ...image,
          image: imageHashes[index].hash,
        }));
      if (!validCache)
        await putMeta(`backup-digest:${pair.id}`, {
          revision,
          sourceHash,
          images: imageHashes,
        } satisfies DigestCache);
      const portable = { ...pair };
      delete portable.revision;
      const snapshot = { ...portable, device, sketch: sourceHash, images };
      const key = await digest(JSON.stringify(snapshot));
      if (savedSnapshots.has(key)) {
        count++;
        continue;
      }
      status(`Backing up ${count + 1} of ${pairs.length} sketches…`);
      const objects = [
        { id: sourceHash, data: pair.sketch },
        ...pair.images.map((image, index) => ({
          id: imageHashes[index].hash,
          data: image.image,
        })),
      ];
      for (const { id, data } of objects) {
        if (!savedObjects.has(id)) {
          await request("objects/" + id, { data });
          savedObjects.add(id);
        }
      }
      await request("snapshots/" + key, snapshot);
      savedSnapshots.add(key);
      count++;
    }
    status(
      `Cloud backup up to date · ${count} sketch ${count === 1 ? "record" : "records"} · ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`,
    );
  })()
    .catch((e) =>
      status(e instanceof Error ? e.message : "Cloud backup will retry."),
    )
    .finally(() => {
      running = undefined;
    });
  return running;
}
export function startCloudBackup() {
  void syncCloud();
  const timer = setInterval(() => void syncCloud(), 15000);
  let debounce: ReturnType<typeof setTimeout>;
  const saved = () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => void syncCloud(), 2000);
  };
  const retry = () => void syncCloud();
  window.addEventListener("online", retry);
  window.addEventListener("incant-archive-saved", saved);
  return () => {
    clearInterval(timer);
    clearTimeout(debounce);
    window.removeEventListener("online", retry);
    window.removeEventListener("incant-archive-saved", saved);
  };
}
export async function restoreCloud() {
  status("Recovering cloud spellbook…");
  try {
    const records = (await request("snapshots")) as (Pair & {
      device: string;
      key: string;
    })[];
    // Autosave can produce many unsealed snapshots for one mutable draft. Keep
    // only its latest revision, while retaining every sealed source and all of
    // the generations later appended to that exact source.
    const latestDrafts = new Map<string, (typeof records)[number]>();
    const historical = records.filter(
      (record) => record.sealed || record.images.length > 0,
    );
    for (const record of records.filter(
      (record) => !record.sealed && record.images.length === 0,
    )) {
      const group = `${record.device}:${record.id}:${record.bundleId || ""}`;
      const old = latestDrafts.get(group);
      const time = record.updated ?? record.created ?? 0,
        oldTime = old?.updated ?? old?.created ?? 0;
      if (!old || time > oldTime || (time === oldTime && record.key > old.key))
        latestDrafts.set(group, record);
    }
    const merged = new Map<string, Pair & { cloudKey: string }>();
    for (const record of [...historical, ...latestDrafts.values()]) {
      const group = `${record.device}:${record.id}:${record.sketch}`;
      const old = merged.get(group);
      const images = [
        ...new Map(
          [...(old?.images ?? []), ...record.images].map((i) => [i.id, i]),
        ).values(),
      ];
      const oldTime = old?.updated ?? old?.created ?? 0,
        time = record.updated ?? record.created ?? 0,
        newest = old && oldTime > time ? old : record;
      merged.set(group, { ...newest, images, cloudKey: group });
    }
    const restored = [];
    for (const pair of merged.values()) {
      const sketch = (await request("objects/" + pair.sketch)).data;
      if ((await digest(sketch)) !== pair.sketch)
        throw new Error(
          "Cloud sketch verification failed. Local work is unchanged.",
        );
      const images = [];
      for (const i of pair.images) {
        const data = (await request("objects/" + i.image)).data;
        if ((await digest(data)) !== i.image)
          throw new Error("Cloud image verification failed.");
        images.push({ ...i, image: data });
      }
      restored.push({ ...pair, sketch, images });
    }
    await importCloudPairs(restored);
    status(
      `Recovered ${restored.length} cloud sketch records. Your current drawing is unchanged.`,
    );
  } catch (e) {
    status(
      e instanceof Error
        ? e.message
        : "Recovery failed; local work is unchanged.",
    );
    throw e;
  }
}
