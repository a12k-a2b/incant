import { useEffect, useRef, useState } from "react";
import type { Creation } from "@/lib/collection";
import { imageFile, shareImage } from "@/lib/share-image";
import {
  owlRequest,
  parchmentPNG,
  wakeOwl,
  hoot,
  type OwlLetter,
} from "@/lib/owl-client";
export function OwlMail({
  active,
  busy,
  mode,
}: {
  active: Creation | null;
  busy: boolean;
  mode: "direct" | "tray";
}) {
  type PreparedParcel = { source: Creation; letter: OwlLetter };
  const sameCreation = (a: Creation, b: Creation) =>
    a.id === b.id &&
    a.image === b.image &&
    a.sketch === b.sketch &&
    a.spell === b.spell;
  const snapshot = (creation: Creation): Creation => ({ ...creation });
  const activeRef = useRef(active);
  activeRef.current = active;
  const dialog = useRef<HTMLDialogElement>(null),
    mounted = useRef(true),
    preparing = useRef(false),
    postingRef = useRef(false);
  const [letters, setLetters] = useState<OwlLetter[]>([]),
    [ready, setReady] = useState<PreparedParcel | null>(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [inboxError, setInboxError] = useState(""),
    [notice, setNotice] = useState(""),
    [unread, setUnread] = useState(0),
    [posting, setPosting] = useState(false);
  const [sound, setSound] = useState(
    () => localStorage.getItem("incant-owl-sound") !== "off",
  );
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const prepared = useRef(new Map<string, PreparedParcel>()),
    requestIds = useRef(
      new Map<string, { source: Creation; requestId: string }>(),
    );
  const seen = useRef(new Set<string>()),
    announced = useRef(new Set<string>()),
    initialized = useRef(false);
  useEffect(() => {
    mounted.current = true;
    try {
      seen.current = new Set(
        JSON.parse(localStorage.getItem("incant-owl-seen") || "[]"),
      );
    } catch {}
    let inFlight = false;
    const poll = async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        const rows = await owlRequest<OwlLetter[]>("");
        if (!mounted.current) return;
        setLetters(rows);
        setReady((current) =>
          current
            ? {
                ...current,
                letter:
                  rows.find((r) => r.id === current.letter.id) ||
                  current.letter,
              }
            : null,
        );
        for (const [id, cached] of prepared.current) {
          const latest = rows.find((r) => r.id === cached.letter.id);
          if (latest?.revoked) {
            prepared.current.delete(id);
            requestIds.current.delete(id);
          }
        }
        setInboxError("");
        const events = rows.flatMap((l) => [
          ...(l.opened ? [`open:${l.id}`] : []),
          ...l.replies.map((r) => `reply:${r.id}`),
        ]);
        const fresh = events.filter(
          (e) => !announced.current.has(e) && !seen.current.has(e),
        );
        setUnread(events.filter((e) => !seen.current.has(e)).length);
        if (fresh.length && initialized.current) {
          if (fresh.some((e) => e.startsWith("reply:"))) {
            setNotice("Hoot! An image has arrived.");
            if (soundRef.current) hoot();
          } else setNotice("Your owl letter was opened.");
        }
        initialized.current = true;
        for (const e of events) announced.current.add(e);
      } catch {
        if (mounted.current)
          setInboxError(
            "Owl post is offline. These receipts may be out of date.",
          );
      } finally {
        inFlight = false;
      }
    };
    void poll();
    const t = setInterval(() => void poll(), 8000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      mounted.current = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", poll);
    };
  }, []);
  async function prepare(creation = activeRef.current) {
    if (!creation || preparing.current) return;
    const image = snapshot(creation);
    const cached = prepared.current.get(image.id);
    if (
      cached &&
      sameCreation(cached.source, image) &&
      !cached.letter.revoked &&
      cached.letter.expires > Date.now()
    ) {
      setReady(cached);
      return;
    }
    preparing.current = true;
    setPending(true);
    setReady(null);
    try {
      let request = requestIds.current.get(image.id);
      if (!request || !sameCreation(request.source, image)) {
        request = { source: image, requestId: crypto.randomUUID() };
        requestIds.current.set(image.id, request);
      }
      const png = await parchmentPNG(imageFile(image));
      const sketch = image.sketch
        ? await parchmentPNG(imageFile({ ...image, image: image.sketch }))
        : undefined;
      const letter = await owlRequest<OwlLetter>("", {
        id: request.requestId,
        image: png,
        sketch,
        spell: image.spell,
      });
      const parcel = { source: image, letter };
      prepared.current.set(image.id, parcel);
      if (mounted.current) {
        if (activeRef.current && sameCreation(activeRef.current, image))
          setReady(parcel);
        setLetters((v) => [letter, ...v.filter((x) => x.id !== letter.id)]);
      }
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      preparing.current = false;
      if (mounted.current) setPending(false);
    }
  }
  function markUpdatesSeen() {
    wakeOwl();
    for (const l of letters) {
      if (l.opened) seen.current.add("open:" + l.id);
      for (const r of l.replies) seen.current.add("reply:" + r.id);
    }
    try {
      localStorage.setItem(
        "incant-owl-seen",
        JSON.stringify([...seen.current]),
      );
    } catch {}
    setUnread(0);
    setError("");
  }
  function show() {
    const hasUnreadPost = unread > 0;
    markUpdatesSeen();
    const image = activeRef.current ? snapshot(activeRef.current) : null;
    if (mode === "direct" && image && !hasUnreadPost) {
      void shareLocal(image);
      return;
    }
    const cached = image ? prepared.current.get(image.id) : null;
    setReady(
      cached &&
        sameCreation(cached.source, image!) &&
        !cached.letter.revoked &&
        cached.letter.expires > Date.now()
        ? cached
        : null,
    );
    dialog.current?.showModal();
  }
  async function shareLocal(image: Creation) {
    if (postingRef.current) return;
    postingRef.current = true;
    setPosting(true);
    setError("");
    try {
      const result = await shareImage(image);
      setNotice(
        result === "cancelled"
          ? "Sharing cancelled. Your image is still here."
          : "Handed to your sharing app. Finish sending there; Sketch Magic cannot confirm delivery.",
      );
    } catch (e) {
      setError((e as Error).message);
      if (activeRef.current && sameCreation(activeRef.current, image)) {
        const cached = prepared.current.get(image.id);
        setReady(
          cached &&
            sameCreation(cached.source, image) &&
            !cached.letter.revoked &&
            cached.letter.expires > Date.now()
            ? cached
            : null,
        );
        dialog.current?.showModal();
      }
    } finally {
      postingRef.current = false;
      setPosting(false);
    }
  }
  async function share(parcel = ready) {
    if (
      !parcel ||
      parcel.letter.revoked ||
      parcel.letter.expires < Date.now() ||
      postingRef.current
    )
      return;
    postingRef.current = true;
    setPosting(true);
    setError("");
    const url = location.origin + "/#owl=" + parcel.letter.token;
    try {
      const result = await shareImage(parcel.source, { url });
      if (result === "cancelled") {
        setNotice("Sharing cancelled. Your image is still here.");
        return;
      }
      setNotice(
        "Handed to your sharing app. Finish sending there; Sketch Magic cannot confirm delivery.",
      );
      try {
        const r = await owlRequest<OwlLetter>(
          "/" + parcel.letter.id + "/handoff",
          {},
        );
        const updated = { ...parcel, letter: r };
        prepared.current.set(parcel.source.id, updated);
        setReady(updated);
        setLetters((v) => v.map((l) => (l.id === r.id ? r : l)));
      } catch {
        setNotice(
          "Handed to your sharing app, but the receipt could not sync. Delivery is unconfirmed.",
        );
      }
    } catch (e) {
      setError((e as Error).message);
      dialog.current?.showModal();
    } finally {
      postingRef.current = false;
      setPosting(false);
    }
  }
  async function revoke(l: OwlLetter) {
    try {
      const r = await owlRequest<OwlLetter>("/" + l.id + "/revoke", {});
      setLetters((v) => v.map((x) => (x.id === l.id ? r : x)));
      if (ready?.letter.id === l.id) setReady(null);
      for (const [key, value] of prepared.current)
        if (value.letter.id === l.id) {
          prepared.current.delete(key);
          requestIds.current.delete(key);
        }
      setNotice(
        "The link is closed. Images already saved by recipients remain theirs.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <button
        className={"owl-key" + (unread ? " owl-has-post" : "")}
        aria-label={unread ? `Owl post, ${unread} new updates` : "Owl post"}
        onClick={show}
        disabled={busy}
      ></button>
      <dialog ref={dialog} className="owl-dialog" aria-label="Owl post">
        <header>
          <span className="wax-seal" aria-hidden="true">
            ✦
          </span>
          <h2>Owl post</h2>
          <button
            aria-label="Close owl post"
            onClick={() => dialog.current?.close()}
          >
            ×
          </button>
        </header>
        <p className="ink-note">A little magic, addressed to someone.</p>
        {active ? (
          <section className="owl-compose">
            <img src={active.image} alt="Image to share" draggable={false} />
            <div>
              {pending ? (
                <p role="status">Tying a ribbon around your image…</p>
              ) : ready && !ready.letter.revoked ? (
                <>
                  <button
                    className="owl-action"
                    disabled={posting}
                    onClick={() => void share()}
                  >
                    Choose where to send
                  </button>
                  <button
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(
                          location.origin + "/#owl=" + ready.letter.token,
                        )
                        .then(() =>
                          setNotice("Link copied. It has not been sent."),
                        )
                        .catch(() => setError("Could not copy the link."));
                    }}
                  >
                    Copy link
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="owl-action"
                    disabled={posting}
                    onClick={() => active && void shareLocal(snapshot(active))}
                  >
                    Choose where to send
                  </button>
                  <button
                    onClick={() => {
                      setError("");
                      void prepare();
                    }}
                  >
                    Prepare reply link
                  </button>
                </>
              )}
              <small>Image · original sketch · your spell</small>
            </div>
          </section>
        ) : (
          <p>Open a finished image from your spellbooks to send it.</p>
        )}
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        <label className="owl-sound">
          <input
            type="checkbox"
            checked={sound}
            onChange={(e) => {
              setSound(e.target.checked);
              localStorage.setItem(
                "incant-owl-sound",
                e.target.checked ? "on" : "off",
              );
              wakeOwl();
              if (e.target.checked) hoot();
            }}
          />{" "}
          Hoot for image replies while Sketch Magic is open
        </label>
        <h3>Letters & replies</h3>
        {inboxError && <p role="status">{inboxError}</p>}
        <details className="owl-fine">
          <summary>About letters & receipts</summary>
          <p>
            A link holder can open this parcel and reply for 30 days. Opened
            means they opened the link; delivery from your sharing app is
            unconfirmed. Replies are shared with this room.
          </p>
        </details>
        {!letters.length && <p>No letters yet.</p>}
        {letters.map((l) => (
          <article className="owl-letter" key={l.id}>
            <p>
              {new Date(l.created).toLocaleString()} ·{" "}
              {l.revoked
                ? "Link closed"
                : l.expires < Date.now()
                  ? "Link expired"
                  : l.opened
                    ? "Opened"
                    : l.handedOff
                      ? "Handed to sharing app"
                      : "Ready to share"}
            </p>
            {l.opened && (
              <small>Opened {new Date(l.opened).toLocaleString()}</small>
            )}
            <div className="owl-replies">
              {l.replies.map((r) => (
                <a
                  key={r.id}
                  href={"/api/owl/" + l.id + "/replies/" + r.id}
                  download={"owl-reply-" + r.id + ".png"}
                >
                  <img
                    src={"/api/owl/" + l.id + "/replies/" + r.id}
                    alt={
                      "Image reply received " +
                      new Date(r.created).toLocaleString()
                    }
                    loading="lazy"
                  />
                  <span>Save reply</span>
                </a>
              ))}
            </div>
            {!l.revoked && (
              <button onClick={() => void revoke(l)}>Close this link</button>
            )}
          </article>
        ))}
      </dialog>
    </>
  );
}
