import { DRAFT_KEY, validDrawing, type Drawing } from "./drawing";
import { afterInk, inkIsActive } from "./ink-activity";

export type DraftSize = { w: number; h: number };
export type DurableDraft = {
  drawing: Drawing;
  size: DraftSize;
  revision: number;
};

const DATABASE = "incant-draft-v1";
const STORE = "drafts";
const CURRENT = "current";
const REVISION = "revision";
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
  const drawing = JSON.stringify(draft.drawing);
  localStorage.setItem(
    FALLBACK_KEY,
    `{"drawing":${drawing},"size":${JSON.stringify(draft.size)},"revision":${draft.revision}}`,
  );
  try {
    localStorage.setItem(DRAFT_KEY, drawing);
    localStorage.setItem(DRAFT_KEY + "-size", JSON.stringify(draft.size));
  } catch {
    /* the atomic fallback envelope is complete */
  }
}

let cancelMirror: (() => void) | undefined;
let mirrorRevision = -1;
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
          request = store.get(REVISION);
        const writeIfNewer = (oldRevision: number) => {
          if (draft.revision >= oldRevision) {
            accepted = true;
            store.put(draft, CURRENT);
            store.put(draft.revision, REVISION);
          }
        };
        request.onsuccess = () => {
          if (Number.isSafeInteger(request.result) && request.result >= 0)
            writeIfNewer(request.result);
          else {
            // First save after upgrade: discover the revision of an existing
            // snapshot once. Keep the compare and both writes in this same
            // transaction, so overlapping saves cannot race or regress.
            const legacy = store.get(CURRENT);
            legacy.onsuccess = () => {
              const old = validDraft(legacy.result)
                ? legacy.result.revision
                : -1;
              if (old >= 0) store.put(old, REVISION);
              writeIfNewer(old);
            };
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
  // A compatibility copy is optional once IDB commits. Avoid synchronous JSON
  // and localStorage work inside the next stroke; keep only the latest mirror.
  // When IDB fails, this becomes the durable fallback and must run immediately.
  if (draft.revision < mirrorRevision) return;
  mirrorRevision = draft.revision;
  cancelMirror?.();
  cancelMirror = undefined;
  if (!durableError && inkIsActive()) {
    cancelMirror = afterInk(() => {
      cancelMirror = undefined;
      if (draft.revision !== mirrorRevision) return;
      try {
        mirror(draft);
      } catch {
        /* IDB already committed */
      }
    });
    return;
  }
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
