import { DRAFT_KEY, validDrawing, type Drawing } from "./drawing";

export type DraftSize = { w: number; h: number };
export type DurableDraft = {
  drawing: Drawing;
  size: DraftSize;
  revision: number;
};

const DATABASE = "incant-draft-v1";
const STORE = "drafts";
const CURRENT = "current";
const FALLBACK_KEY = DRAFT_KEY + "-snapshot";

function validSize(value: unknown): value is DraftSize {
  if (!value || typeof value !== "object") return false;
  const { w, h } = value as DraftSize;
  return [w, h].every(
    (dimension) =>
      Number.isInteger(dimension) &&
      dimension >= 512 &&
      dimension <= 1536 &&
      dimension % 16 === 0,
  );
}

function validDraft(value: unknown): value is DurableDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as DurableDraft;
  return (
    validDrawing(draft.drawing) &&
    validSize(draft.size) &&
    Number.isSafeInteger(draft.revision) &&
    draft.revision >= 0
  );
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function read(): Promise<DurableDraft | null> {
  const database = await open();
  try {
    return await new Promise((resolve, reject) => {
      const request = database
        .transaction(STORE)
        .objectStore(STORE)
        .get(CURRENT);
      request.onsuccess = () =>
        resolve(validDraft(request.result) ? request.result : null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

function fallbackDraft(): DurableDraft | null {
  try {
    const committed = JSON.parse(localStorage.getItem(FALLBACK_KEY) || "null");
    if (validDraft(committed)) return committed;
  } catch {
    // A corrupt optional envelope must not hide a valid pre-migration draft.
  }
  try {
    const drawing = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"),
      size = JSON.parse(localStorage.getItem(DRAFT_KEY + "-size") || "null");
    return validDrawing(drawing)
      ? {
          drawing,
          size: validSize(size) ? size : { w: 1024, h: 1536 },
          revision: 0,
        }
      : null;
  } catch {
    return null;
  }
}

function mirror(draft: DurableDraft) {
  // One envelope is the committed fallback. The old split keys remain a
  // best-effort compatibility mirror and are never used to outrank it.
  localStorage.setItem(FALLBACK_KEY, JSON.stringify(draft));
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft.drawing));
    localStorage.setItem(DRAFT_KEY + "-size", JSON.stringify(draft.size));
  } catch {
    /* the atomic fallback envelope is complete */
  }
}

export async function saveDurableDraft(draft: DurableDraft): Promise<void> {
  if (!validDraft(draft)) throw new Error("Invalid Incant draft.");
  let durableError: unknown;
  let accepted = false;
  try {
    const database = await open();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE, "readwrite"),
          store = transaction.objectStore(STORE),
          request = store.get(CURRENT);
        request.onsuccess = () => {
          const old = validDraft(request.result) ? request.result : null;
          if (!old || draft.revision >= old.revision) {
            accepted = true;
            store.put(draft, CURRENT);
          }
        };
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  } catch (error) {
    durableError = error;
  }
  if (!accepted && !durableError) return;
  try {
    mirror(draft);
  } catch {
    if (durableError) throw durableError;
    // IndexedDB is authoritative. A full fallback store does not make the
    // completed durable save fail.
  }
}

export async function loadDurableDraft(): Promise<DurableDraft | null> {
  let durable: DurableDraft | null = null;
  try {
    durable = await read();
  } catch {
    // Older/private browsers can continue from the compatibility mirror.
  }
  const fallback = fallbackDraft();
  const latest =
    fallback && (!durable || fallback.revision > durable.revision)
      ? fallback
      : durable;
  if (!latest) return null;
  if (latest === durable) return durable;
  try {
    await saveDurableDraft(latest);
  } catch {
    /* the validated committed fallback is still usable */
  }
  return latest;
}
