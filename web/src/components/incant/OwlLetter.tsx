import { useEffect, useState, useRef } from "react";
import { owlRequest, parchmentPNG } from "@/lib/owl-client";
export function OwlLetter({ token }: { token: string }) {
  const [sketchImage, setSketchImage] = useState("");
  const [spell, setSpell] = useState("");
  const [available, setAvailable] = useState(false),
    [image, setImage] = useState(""),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [reply, setReply] = useState(""),
    [sent, setSent] = useState(false);
  const replyId = useRef(crypto.randomUUID());
  const objectUrl = useRef("");
  useEffect(() => {
    void owlRequest("", undefined, token)
      .then(() => setAvailable(true))
      .catch((e) => setError(e.message));
    return () => URL.revokeObjectURL(objectUrl.current);
  }, [token]);
  async function openLetter() {
    setPending(true);
    setError("");
    try {
      const parcel = await owlRequest("/open", {}, token);
      setSpell(parcel.spell || "");
      if (parcel.hasSketch) {
        const source = await fetch("/api/owl-public/sketch", {
          headers: { "x-owl-key": token },
          signal: AbortSignal.timeout(20000),
        });
        if (!source.ok)
          throw new Error("The original sketch could not load. Try again.");
        const blob = await source.blob();
        const data = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = reject;
          r.readAsDataURL(blob);
        });
        setSketchImage(data);
      }
      const r = await fetch("/api/owl-public/image", {
        headers: { "x-owl-key": token },
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok)
        throw new Error("The image could not be opened. Please try again.");
      const url = URL.createObjectURL(await r.blob());
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = url;
      setImage(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  async function choose(file?: File) {
    if (!file) return;
    setPending(true);
    setError("");
    setSent(false);
    setReply("");
    try {
      const data = await parchmentPNG(file);
      replyId.current = crypto.randomUUID();
      setReply(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  async function send() {
    setPending(true);
    setError("");
    try {
      await owlRequest("/reply", { id: replyId.current, image: reply }, token);
      setSent(true);
      setReply("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="owl-receiving">
      <section>
        <p className="eyebrow">SKETCH MAGIC · OWL POST</p>
        <span className="wax-seal" aria-hidden="true">
          ✦
        </span>
        <h1>A small act of sorcery.</h1>
        {!image ? (
          <>
            <p>
              Open the seal to reveal a scribble, its spell, and what it became.
            </p>
            <button
              className="owl-action"
              onClick={() => void openLetter()}
              disabled={!available || pending}
            >
              {pending ? "Opening…" : "Open letter"}
            </button>
            <p className="owl-fine">Opening sends a receipt to the sender.</p>
          </>
        ) : (
          <>
            <img
              className="owl-received-image"
              src={image}
              alt="Image sent to you through Sketch Magic"
            />
            <a href={image} download="sketch-magic-image.png">
              Save image
            </a>
            {sketchImage && (
              <figure className="owl-original">
                <img src={sketchImage} alt="Original sketch" />
                <figcaption>Where the magic began</figcaption>
              </figure>
            )}
            {spell && <blockquote className="parcel-spell">{spell}</blockquote>}
            <h2>Send an image back</h2>
            <p>
              Your reply goes to the sender’s Sketch Magic room. Everyone with access
              to that room can see it.
            </p>
            <label className="owl-upload">
              Choose an image
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={pending}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  void choose(file);
                }}
              />
            </label>
            {reply && (
              <>
                <img
                  className="owl-reply-preview"
                  src={reply}
                  alt="Your image reply"
                />
                <button
                  className="owl-action"
                  disabled={pending}
                  onClick={() => void send()}
                >
                  {pending ? "Sending…" : "Send image reply"}
                </button>
              </>
            )}
            {sent && (
              <p role="status">
                Your image reply is saved. The owl will bring it to their room.
              </p>
            )}
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <details className="owl-fine">
          <summary>About this letter</summary>
          <p>
            Opening lets the sender know. Link holders can view and reply for 30
            days. Replies here reach the sender’s room; replies in email or
            Messages do not.
          </p>
        </details>
      </section>
    </main>
  );
}
