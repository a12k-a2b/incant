import {
  allPairs,
  meta,
  putMeta,
  importCloudPairs,
  type Pair,
} from "./archive";
export let backupStatus = "Checking cloud backup…";
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
      const sourceHash = await digest(pair.sketch);
      const images = await Promise.all(
        pair.images.map(async (i) => ({ ...i, image: await digest(i.image) })),
      );
      const snapshot = { ...pair, device, sketch: sourceHash, images };
      const key = await digest(JSON.stringify(snapshot));
      if (savedSnapshots.has(key)) {
        count++;
        continue;
      }
      status(`Backing up ${count + 1} of ${pairs.length} sketches…`);
      for (const data of [pair.sketch, ...pair.images.map((i) => i.image)]) {
        const id = await digest(data);
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
    // Combine repeated backups of the same exact source, retaining every generation.
    const merged = new Map<string, Pair & { cloudKey: string }>();
    for (const record of records) {
      const group = `${record.device}:${record.id}:${record.sketch}`;
      const old = merged.get(group);
      const images = [
        ...new Map(
          [...(old?.images ?? []), ...record.images].map((i) => [i.id, i]),
        ).values(),
      ];
      merged.set(group, { ...record, images, cloudKey: group });
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
