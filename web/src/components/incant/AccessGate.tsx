import { useEffect, useState, type FormEvent } from "react";
import { IncantApp } from "./IncantApp";
import { Sigil } from "./DeskArt";
export function AccessGate() {
  const [session, setSession] = useState<{
      unlocked: boolean;
      imageReady?: boolean;
      voiceReady?: boolean;
    } | null>(null),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  const check = () =>
    fetch("/api/session", { signal: AbortSignal.timeout(8000) })
      .then((r) => r.json())
      .then(setSession)
      .catch(() => setSession({ unlocked: true }));
  useEffect(() => {
    void check();
  }, []);
  async function unlock(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      const r = await fetch("/api/unlock", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const b = await r.json();
      if (!b.ok) throw new Error(b.error);
      setPassword("");
      await check();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not unlock. Check your connection.",
      );
    } finally {
      setPending(false);
    }
  }
  if (!session)
    return (
      <div className="entry-room">
        <p>Opening the drawing room…</p>
      </div>
    );
  if (session.unlocked)
    return (
      <IncantApp
        imageReady={session.imageReady}
        voiceReady={session.voiceReady}
      />
    );
  return (
    <main className="entry-room">
      <form onSubmit={(e) => void unlock(e)}>
        <Sigil />
        <p className="eyebrow">INCANT · YOUR PRIVATE DRAWING ROOM</p>
        <h1>
          A little door to
          <br />
          <em>something wonderful.</em>
        </h1>
        <p>Enter your room’s passphrase to begin.</p>
        <label htmlFor="room-key">Room passphrase</label>
        <input
          id="room-key"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button className="cast-button" disabled={pending}>
          {pending ? "Opening…" : "Open the room"}
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
    </main>
  );
}
