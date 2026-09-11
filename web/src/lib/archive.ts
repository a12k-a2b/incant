// Independent archive: do not change the existing gallery database or draft format.
export type Pair = {
  id?: number;
  bundleId?: string;
  sessionId?: string;
  sessionStarted?: number;
  created?: number;
  updated?: number;
  day?: string;
  sketch: string;
  spell: string;
  sealed: boolean;
  images: { id: string; image: string; spell: string; created?: number }[];
};
type Directory = FileSystemDirectoryHandle & {
  queryPermission(o: { mode: string }): Promise<PermissionState>;
};
export const SESSION_GAP_MS = 45 * 60 * 1000;
export function localDay(time: number) {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
type Session = { id: string; started: number; lastActivity: number };
const DATABASE = "incant-pairs-v1";
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DATABASE, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("pairs", {
        keyPath: "id",
        autoIncrement: true,
      });
      r.result.createObjectStore("meta");
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function meta<T>(key: string): Promise<T | undefined> {
  const d = await open();
  try {
    return await new Promise((resolve, reject) => {
      const r = d.transaction("meta").objectStore("meta").get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } finally {
    d.close();
  }
}
async function putMeta(key: string, value: unknown) {
  const d = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const t = d.transaction("meta", "readwrite");
      t.objectStore("meta").put(value, key);
      t.oncomplete = () => resolve();
      t.onabort = () => reject(t.error);
      t.onerror = () => reject(t.error);
    });
  } finally {
    d.close();
  }
}
export async function archiveSketch(
  sketch: string,
  spell: string,
  seal = false,
  now = Date.now(),
): Promise<Pair> {
  const d = await open();
  try {
    return await new Promise((resolve, reject) => {
      const t = d.transaction(["pairs", "meta"], "readwrite"),
        p = t.objectStore("pairs"),
        m = t.objectStore("meta");
      let saved: Pair;
      let session: Session;
      const save = (old?: Pair) => {
        const same = old?.sketch === sketch;
        saved =
          old && (!old.sealed || same)
            ? { ...old, sketch, spell, sealed: old.sealed || seal }
            : { sketch, spell, sealed: seal, images: [] };
        saved = {
          ...saved,
          bundleId: old?.bundleId ?? `sketch-${crypto.randomUUID()}`,
          sessionId: old?.sessionId ?? session.id,
          sessionStarted: old?.sessionStarted ?? session.started,
          created: saved.created ?? now,
          updated: now,
          day: old?.day ?? localDay(now),
        };
        m.put({ ...session, lastActivity: now }, "session");
        const r = p.put(saved);
        r.onsuccess = () => {
          saved.id = Number(r.result);
          m.put(saved.id, "current");
        };
      };
      const sr = m.get("session");
      sr.onsuccess = () => {
        const oldSession = sr.result as Session | undefined;
        session =
          oldSession &&
          now >= oldSession.lastActivity &&
          now - oldSession.lastActivity <= SESSION_GAP_MS
            ? oldSession
            : {
                id: `session-${crypto.randomUUID()}`,
                started: now,
                lastActivity: now,
              };
        const r = m.get("current");
        r.onsuccess = () => {
          if (r.result) {
            const q = p.get(r.result);
            q.onsuccess = () => save(q.result);
          } else save();
        };
      };
      t.oncomplete = () => resolve(saved);
      t.onabort = () => reject(t.error);
      t.onerror = () => reject(t.error);
    });
  } finally {
    d.close();
  }
}
export async function archiveImage(
  pairId: number,
  image: { id: string; image: string; spell: string },
): Promise<Pair> {
  const d = await open();
  try {
    return await new Promise((resolve, reject) => {
      const t = d.transaction("pairs", "readwrite"),
        s = t.objectStore("pairs");
      let pair: Pair;
      const r = s.get(pairId);
      r.onsuccess = () => {
        pair = r.result;
        if (!pair) {
          t.abort();
          return;
        }
        if (!pair.images.some((i) => i.id === image.id))
          pair.images.push({ ...image, created: Date.now() });
        pair.updated = Date.now();
        s.put(pair);
      };
      t.oncomplete = () => resolve(pair);
      t.onabort = () => reject(t.error || new Error("Sketch pair missing"));
      t.onerror = () => reject(t.error);
    });
  } finally {
    d.close();
  }
}
// Backfill existing saved casts once; keep the active drawing's pair untouched.
export async function archiveExisting(
  items: {
    id: string;
    image: string;
    spell: string;
    sketch?: string;
    created?: number;
  }[],
) {
  const d = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const t = d.transaction(["pairs", "meta"], "readwrite"),
        p = t.objectStore("pairs"),
        m = t.objectStore("meta");
      const r = p.getAll();
      r.onsuccess = () => {
        // Existing archives predate timestamps. Recover known generation times
        // from the gallery, leaving unknown sessions explicitly unassigned.
        for (const pair of r.result as Pair[]) {
          if (pair.created) continue;
          const times = pair.images
            .map((image) => items.find((c) => c.id === image.id)?.created)
            .filter((n): n is number => typeof n === "number");
          if (times.length) {
            pair.created = Math.min(...times);
            pair.updated = Math.max(...times);
            pair.day = localDay(pair.created);
            p.put(pair);
          }
        }
        const known = new Set(
          (r.result as Pair[]).flatMap((p) => p.images.map((i) => i.id)),
        );
        for (const item of items) {
          if (!item.sketch || known.has(item.id)) continue;
          known.add(item.id);
          p.add({
            bundleId: `legacy-${item.id}`,
            created: item.created,
            updated: item.created,
            day: item.created ? localDay(item.created) : undefined,
            sketch: item.sketch,
            spell: item.spell,
            sealed: true,
            images: [{ id: item.id, image: item.image, spell: item.spell }],
          });
        }
      };
      t.oncomplete = () => resolve();
      t.onabort = () => reject(t.error);
      t.onerror = () => reject(t.error);
    });
  } finally {
    d.close();
  }
}
export async function allPairs(): Promise<Pair[]> {
  const d = await open();
  try {
    return await new Promise((resolve, reject) => {
      const r = d.transaction("pairs").objectStore("pairs").getAll();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } finally {
    d.close();
  }
}
async function readPair(id: number): Promise<Pair[]> {
  const d = await open();
  try {
    return await new Promise((resolve, reject) => {
      const r = d.transaction("pairs").objectStore("pairs").get(id);
      r.onsuccess = () => resolve(r.result ? [r.result] : []);
      r.onerror = () => reject(r.error);
    });
  } finally {
    d.close();
  }
}
export async function endPage() {
  await putMeta("current", null);
}
export function directorySupported() {
  return "showDirectoryPicker" in window;
}
export async function archiveFolderReady() {
  const folder = await meta<Directory>("folder");
  return (
    !!folder &&
    (await folder.queryPermission({ mode: "readwrite" })) === "granted"
  );
}
export async function chooseArchiveFolder() {
  // Invoke picker before the first await to retain the user's activation.
  const picker = (
    window as unknown as { showDirectoryPicker(o: unknown): Promise<Directory> }
  ).showDirectoryPicker({ mode: "readwrite", id: "incant-archive" });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const selected = await Promise.race([
    picker,
    new Promise<never>((_, reject) => {
      timeout = setTimeout(
        () =>
          reject(
            new Error(
              "The folder picker did not respond. Download your pairs instead, or try opening Incant in Chrome.",
            ),
          ),
        30000,
      );
    }),
  ]).finally(() => clearTimeout(timeout));
  let namespace = await meta<string>("namespace");
  if (!namespace) {
    namespace = "Incant-" + crypto.randomUUID().slice(0, 8);
    await putMeta("namespace", namespace);
  }
  const folder = await selected.getDirectoryHandle(namespace, { create: true });
  await putMeta("folder", folder);
  exported.clear();
  await syncArchive();
}
function bytes(data: string) {
  const raw = atob(data.substring(data.indexOf(",") + 1));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
export function pairFiles(pair: Pair): [string, Uint8Array][] {
  const prefix = "pair-" + String(pair.id).padStart(4, "0");
  return [
    [prefix + "-sketch.png", bytes(pair.sketch)],
    ...pair.images.map((i, n): [string, Uint8Array] => [
      prefix +
        "-image" +
        (n ? "-" + String(n + 1).padStart(2, "0") : "") +
        ".png",
      bytes(i.image),
    ]),
    [
      prefix + "-spell.json",
      new TextEncoder().encode(
        JSON.stringify(
          {
            pair: pair.id,
            bundleId: pair.bundleId,
            sessionId: pair.sessionId,
            sessionStarted: pair.sessionStarted,
            day: pair.day,
            created: pair.created,
            updated: pair.updated,
            spell: pair.spell,
            images: pair.images.map(({ id, spell, created }, n) => ({
              created,
              id,
              spell,
              file:
                prefix +
                "-image" +
                (n ? "-" + String(n + 1).padStart(2, "0") : "") +
                ".png",
            })),
          },
          null,
          2,
        ),
      ),
    ],
  ];
}
let fileQueue: Promise<void> = Promise.resolve();
const exported = new Map<number, string>();
export function syncArchive(pairId?: number) {
  const task = fileQueue
    .catch(() => {})
    .then(async () => {
      const folder = await meta<Directory>("folder");
      if (
        !folder ||
        (await folder.queryPermission({ mode: "readwrite" })) !== "granted"
      )
        throw new Error(
          "Choose your Incant folder to save copies in Files. Your drawings remain saved in this browser.",
        );
      const pairs = pairId ? await readPair(pairId) : await allPairs();
      for (const pair of pairs) {
        const raw =
          pair.sketch + pair.spell + pair.images.map((i) => i.id).join(",");
        const signature = Array.from(
          new Uint8Array(
            await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(raw),
            ),
          ),
          (b) => b.toString(16).padStart(2, "0"),
        ).join("");
        if (exported.get(pair.id!) === signature) continue;
        for (const [name, data] of pairFiles(pair)) {
          const file = await folder.getFileHandle(name, { create: true });
          const stream = await file.createWritable();
          try {
            await stream.write(data as BlobPart);
            await stream.close();
          } catch (e) {
            await stream.abort().catch(() => {});
            throw e;
          }
        }
        exported.set(pair.id!, signature);
      }
    });
  fileQueue = task;
  return task;
}
// Standard uncompressed ZIP, for browsers without directory access. One download,
// with the same file names, instead of multiple Chrome-blocked automatic downloads.
function crc(bytes: Uint8Array) {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
export function zipFiles(files: [string, Uint8Array][]): Blob {
  const chunks: Uint8Array[] = [],
    central: Uint8Array[] = [];
  let offset = 0,
    size = 0;
  for (const [name, data] of files) {
    const n = new TextEncoder().encode(name),
      h = new Uint8Array(30 + n.length),
      v = new DataView(h.buffer),
      c = crc(data);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint32(14, c, true);
    v.setUint32(18, data.length, true);
    v.setUint32(22, data.length, true);
    v.setUint16(26, n.length, true);
    h.set(n, 30);
    chunks.push(h, data);
    const d = new Uint8Array(46 + n.length),
      w = new DataView(d.buffer);
    w.setUint32(0, 0x02014b50, true);
    w.setUint16(4, 20, true);
    w.setUint16(6, 20, true);
    w.setUint32(16, c, true);
    w.setUint32(20, data.length, true);
    w.setUint32(24, data.length, true);
    w.setUint16(28, n.length, true);
    w.setUint32(42, offset, true);
    d.set(n, 46);
    central.push(d);
    size += d.length;
    offset += h.length + data.length;
  }
  const end = new Uint8Array(22),
    e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, size, true);
  e.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, end] as BlobPart[], {
    type: "application/zip",
  });
}
export async function downloadArchive() {
  const blob = zipFiles(
      (await allPairs()).flatMap((pair) => {
        const safe = (v: string) => v.replace(/[^a-zA-Z0-9_-]/g, "_");
        const folder = [
          pair.day || "earlier-undated",
          pair.sessionId || "session-unknown",
          pair.bundleId || `sketch-${pair.id}`,
        ]
          .map(safe)
          .join("/");
        return pairFiles(pair).map(([name, bytes]): [string, Uint8Array] => [
          folder + "/" + name,
          bytes,
        ]);
      }),
    ),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "Incant-pairs.zip";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
