import { useEffect, useRef, useState } from "react";
import type { Creation } from "@/lib/collection";
import { imageFile } from "@/lib/share-image";
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
}: {
  active: Creation | null;
  busy: boolean;
}) {
  const activeRef = useRef(active);
  activeRef.current = active;
  const dialog = useRef<HTMLDialogElement>(null),
    mounted = useRef(true),
    preparing = useRef(false);
  const [letters, setLetters] = useState<OwlLetter[]>([]),
    [ready, setReady] = useState<OwlLetter | null>(null),
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
  const prepared = useRef(new Map<string, OwlLetter>()),
    requestIds = useRef(new Map<string, string>());
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
          current ? rows.find((r) => r.id === current.id) || current : null,
        );
        for (const [id, cached] of prepared.current) {
          const latest = rows.find((r) => r.id === cached.id);
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
  async function prepare() {
    if (!active || preparing.current) return;
    const image = active;
    const cached = prepared.current.get(image.id);
    if (cached && !cached.revoked && cached.expires > Date.now()) {
      setReady(cached);
      return;
    }
    preparing.current = true;
    setPending(true);
    setReady(null);
    try {
      let id = requestIds.current.get(image.id);
      if (!id) {
        id = crypto.randomUUID();
        requestIds.current.set(image.id, id);
      }
      const png = await parchmentPNG(imageFile(image));
      const letter = await owlRequest<OwlLetter>("", { id, image: png });
      prepared.current.set(image.id, letter);
      if (mounted.current) {
        if (activeRef.current?.id === image.id) setReady(letter);
        setLetters((v) => [letter, ...v.filter((x) => x.id !== letter.id)]);
      }
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      preparing.current = false;
      if (mounted.current) setPending(false);
    }
  }
  function show() {
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
    setReady(null);
    dialog.current?.showModal();
    void prepare();
  }
  async function share() {
    if (!ready || ready.revoked || ready.expires < Date.now() || posting)
      return;
    setPosting(true);
    setError("");
    const url = location.origin + "/#owl=" + ready.token;
    try {
      if (!navigator.share)
        throw new Error(
          "This browser has no share sheet. Use Copy link instead.",
        );
      const file = active ? imageFile(active) : null;
      const data: ShareData = {
        title: "An image carried by owl",
        text: "Open this Incant image and send an image back.",
        url,
      };
      if (file && navigator.canShare?.({ ...data, files: [file] }))
        data.files = [file];
      await navigator.share(data);
      setNotice(
        "Handed to your sharing app. Finish sending there; Incant cannot confirm delivery.",
      );
      try {
        const r = await owlRequest<OwlLetter>("/" + ready.id + "/handoff", {});
        setReady(r);
        setLetters((v) => v.map((l) => (l.id === r.id ? r : l)));
      } catch {
        setNotice(
          "Handed to your sharing app, but the receipt could not sync. Delivery is unconfirmed.",
        );
      }
    } catch (e) {
      if ((e as Error).name === "AbortError")
        setNotice("Sharing cancelled. Your image is still here.");
      else setError((e as Error).message);
    } finally {
      setPosting(false);
    }
  }
  async function revoke(l: OwlLetter) {
    try {
      const r = await owlRequest<OwlLetter>("/" + l.id + "/revoke", {});
      setLetters((v) => v.map((x) => (x.id === l.id ? r : x)));
      if (ready?.id === l.id) setReady(null);
      for (const [key, value] of prepared.current)
        if (value.id === l.id) {
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
      >
        {unread > 0 && <span aria-hidden="true">✉</span>}
      </button>
      <dialog ref={dialog} className="owl-dialog" aria-label="Owl post">
        <header>
          <h2>Owl post</h2>
          <button
            aria-label="Close owl post"
            onClick={() => dialog.current?.close()}
          >
            ×
          </button>
        </header>
        <p>Send an image by email, Messages, or another app.</p>
        {active ? (
          <section className="owl-compose">
            <img src={active.image} alt="Image to share" draggable={false} />
            <div>
              {pending ? (
                <p role="status">Tying a ribbon around your image…</p>
              ) : ready && !ready.revoked ? (
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
                        .writeText(location.origin + "/#owl=" + ready.token)
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
                <button
                  onClick={() => {
                    setError("");
                    void prepare();
                  }}
                >
                  Prepare image
                </button>
              )}
              <small>
                Anyone with the link can open this image and reply for 30 days.
                No access to your other creations. Keep the link in your message
                for opened receipts and replies.
              </small>
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
          Hoot for image replies while Incant is open
        </label>
        <h3>Letters & replies</h3>
        {inboxError && <p role="status">{inboxError}</p>}
        <p className="owl-fine">
          “Opened” means someone chose Open letter at your link. Email and SMS
          apps do not report sending or reading back to Incant. Replies are from
          link holders, not verified identities. This post belongs to everyone
          using this room’s passphrase.
        </p>
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
