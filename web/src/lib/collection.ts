export type Creation = {
  id: string;
  image: string;
  spell: string;
  created: number;
  sketch?: string;
};
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("incant-spellbook", 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore("creations", { keyPath: "id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function loadCreations(): Promise<Creation[]> {
  const d = await db();
  try {
    return await new Promise((resolve, reject) => {
      const r = d.transaction("creations").objectStore("creations").getAll();
      r.onsuccess = () =>
        resolve((r.result as Creation[]).sort((a, b) => a.created - b.created));
      r.onerror = () => reject(r.error);
    });
  } finally {
    d.close();
  }
}
export async function saveCreation(c: Creation) {
  const d = await db();
  try {
    await new Promise<void>((resolve, reject) => {
      const t = d.transaction("creations", "readwrite");
      t.objectStore("creations").put(c);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    d.close();
  }
}
