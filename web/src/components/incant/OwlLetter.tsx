import { useEffect, useState, useRef } from "react";
import { owlRequest, parchmentPNG } from "@/lib/owl-client";
export function OwlLetter({ token }: { token: string }) {
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
      await owlRequest("/open", {}, token);
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
        <p className="eyebrow">INCANT · OWL POST</p>
        <h1>An image has found you.</h1>
        {!image ? (
          <>
            <p>
              Opening this letter lets its sender know the link was opened.
              Anyone holding this link can view and reply.
            </p>
            <button
              className="owl-action"
              onClick={() => void openLetter()}
              disabled={!available || pending}
            >
              {pending ? "Opening…" : "Open letter"}
            </button>
          </>
        ) : (
          <>
            <img
              className="owl-received-image"
              src={image}
              alt="Image sent to you through Incant"
            />
            <a href={image} download="incant-image.png">
              Save image
            </a>
            <h2>Send an image back</h2>
            <p>
              Your reply goes to the sender’s Incant room. Everyone with access
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
        <p className="owl-fine">
          This link expires after 30 days and can be closed by the sender.
          Replies to the email or text itself don’t reach Incant—use this page.
        </p>
      </section>
    </main>
  );
}
