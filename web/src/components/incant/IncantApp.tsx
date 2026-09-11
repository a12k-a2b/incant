import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BookOpen,
  Feather,
  Eraser,
  Undo2,
  Redo2,
  Plus,
  Download,
  ArrowLeft,
  Sparkles,
  Volume2,
  X,
  CircleHelp,
  RotateCcw,
} from "lucide-react";
import { GeminiLiveTranscribe, downsampleTo16k } from "@/lib/gemini-live";
import { loadSettings, saveSettings } from "@/lib/settings";
import { requestCast } from "@/lib/cast-client";
import { loadCreations, saveCreation, type Creation } from "@/lib/collection";
import {
  SketchCanvas,
  type SketchCanvasHandle,
  type Tool,
} from "./SketchCanvas";
import { Grimoire } from "./Grimoire";
import { DeskArt, Sigil, ParchmentFrame } from "./DeskArt";
type Phase = "idle" | "connecting" | "listening" | "finishing" | "casting";
type Voice = {
  live: GeminiLiveTranscribe;
  controller: AbortController;
  stream?: MediaStream;
  ctx?: AudioContext;
  proc?: ScriptProcessorNode;
  ready: boolean;
  timer?: ReturnType<typeof setTimeout>;
};
const describe = (err: unknown) =>
  err instanceof Error
    ? err.message
    : "The spell could not finish. Please try again.";
function download(src: string, name: string) {
  const a = document.createElement("a");
  a.href = src;
  a.download = name;
  a.click();
}
export function IncantApp({
  imageReady = false,
  voiceReady = false,
}: {
  imageReady?: boolean;
  voiceReady?: boolean;
}) {
  const sketch = useRef<SketchCanvasHandle>(null),
    voice = useRef<Voice | null>(null),
    operation = useRef<AbortController | null>(null),
    serial = useRef(0);
  const [settings, setSettings] = useState(loadSettings),
    [phase, setPhase] = useState<Phase>("idle"),
    [words, setWords] = useState(() => {
      try {
        return localStorage.getItem("incant-spell-v2") || "";
      } catch {
        return "";
      }
    });
  const [tool, setTool] = useState<Tool>("quill"),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [book, setBook] = useState(false),
    [help, setHelp] = useState(false),
    [creations, setCreations] = useState<Creation[]>([]),
    [active, setActive] = useState<Creation | null>(null);
  const [elapsed, setElapsed] = useState(0),
    [progress, setProgress] = useState(""),
    [last, setLast] = useState<{ sketch: string; words: string } | null>(null);
  const busy = phase !== "idle",
    empty = sketch.current?.isEmpty() ?? true;
  useEffect(() => {
    try {
      saveSettings(settings);
    } catch {
      setNotice("Settings could not be saved in this browser.");
    }
  }, [settings]);
  useEffect(() => {
    try {
      localStorage.setItem("incant-spell-v2", words);
    } catch {
      setNotice("Your spell could not be saved. Copy it before leaving.");
    }
  }, [words]);
  useEffect(() => {
    let alive = true;
    void loadCreations()
      .then((x) => {
        if (alive) setCreations(x);
      })
      .catch(() => {
        if (alive)
          setNotice(
            "The spellbook is unavailable. Download images you want to keep.",
          );
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (phase !== "casting") return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);
  const closeVoice = (s: Voice) => {
    clearTimeout(s.timer);
    s.controller.abort();
    s.proc?.disconnect();
    s.stream?.getTracks().forEach((t) => t.stop());
    void s.ctx?.close().catch(() => {});
    s.live.disconnect();
    if (voice.current === s) voice.current = null;
  };
  const cancel = () => {
    serial.current++;
    if (voice.current) closeVoice(voice.current);
    operation.current?.abort();
    operation.current = null;
    setPhase("idle");
    setProgress("");
  };
  useEffect(() => {
    const hidden = () => {
      if (document.hidden && voice.current) {
        closeVoice(voice.current);
        setPhase("idle");
        setNotice("Listening stopped when you left the desk.");
      }
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      if (voice.current) closeVoice(voice.current);
      operation.current?.abort();
    };
  }, []);
  async function cast(spell = words, again = false) {
    if (operation.current) return;
    const png = again ? last?.sketch : sketch.current?.exportPng(),
      text = (again ? last?.words : spell)?.trim();
    if (!png || (!again && sketch.current?.isEmpty())) {
      setError("Draw something first. A few lines are enough.");
      return;
    }
    if (!text) {
      setError(
        "Tell the parchment what to become. Speak, or write a spell below.",
      );
      return;
    }
    const control = new AbortController();
    operation.current = control;
    const id = ++serial.current;
    setLast({ sketch: png, words: text });
    setWords(text);
    setError("");
    setPhase("casting");
    setProgress("Sending your sketch…");
    const timer = setTimeout(() => control.abort(), 180000);
    let successes = 0;
    try {
      const count = again ? 1 : settings.fourfold ? 4 : 1;
      const results = await Promise.allSettled(
        Array.from({ length: count }, async (_, i) => {
          const image = await requestCast(
            png,
            text,
            settings,
            again ? creations.length : i,
            control.signal,
          );
          if (id !== serial.current) return;
          const item = {
            id: crypto.randomUUID(),
            image,
            sketch: png,
            spell: text,
            created: Date.now(),
          };
          successes++;
          setCreations((prev) => [...prev, item]);
          if (successes === 1) setActive(item);
          setProgress(`${successes} of ${count} images ready`);
          try {
            await saveCreation(item);
          } catch {
            setNotice(
              "This image could not be saved. Download it before leaving.",
            );
          }
        }),
      );
      if (id !== serial.current) return;
      const failures = results.filter((r) => r.status === "rejected");
      if (!successes && failures[0]?.status === "rejected")
        throw failures[0].reason;
      if (failures.length)
        setNotice(
          `${successes} images saved; ${failures.length} could not finish. You can try another.`,
        );
    } catch (err) {
      if (id === serial.current)
        setError(
          control.signal.aborted
            ? "The image service took too long. Your sketch is safe. Check your connection before trying again."
            : describe(err),
        );
    } finally {
      clearTimeout(timer);
      if (id === serial.current) {
        operation.current = null;
        setPhase("idle");
        setProgress("");
      }
    }
  }
  async function beginVoice() {
    if (busy || voice.current || operation.current) return;
    if (empty) {
      setError("Draw a few lines first, then hold the wand and speak.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        "Voice needs a secure connection and microphone access. You can still type your spell.",
      );
      return;
    }
    const s: Voice = {
      live: new GeminiLiveTranscribe(),
      controller: new AbortController(),
      ready: false,
    };
    voice.current = s;
    setError("");
    setPhase("connecting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      if (voice.current !== s) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      s.stream = stream;
      const response = await fetch("/api/gemini-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geminiKey: settings.geminiKey }),
        signal: AbortSignal.any([
          s.controller.signal,
          AbortSignal.timeout(15000),
        ]),
      });
      const body = await response.json();
      if (!response.ok || !body.token)
        throw new Error(
          body.error ||
            "Voice is not configured. Open the spellbook, or type your spell.",
        );
      if (voice.current !== s) return;
      await s.live.connect(body.token, (text) => {
        if (voice.current === s) setWords(text);
      });
      if (voice.current !== s) return;
      s.live.startTurn();
      s.ctx = new AudioContext();
      await s.ctx.resume();
      if (voice.current !== s) {
        void s.ctx.close();
        return;
      }
      const source = s.ctx.createMediaStreamSource(stream),
        proc = s.ctx.createScriptProcessor(2048, 1, 1);
      s.proc = proc;
      proc.onaudioprocess = (e) =>
        s.live.sendPcm16(
          downsampleTo16k(e.inputBuffer.getChannelData(0), s.ctx!.sampleRate),
        );
      const mute = s.ctx.createGain();
      mute.gain.value = 0;
      source.connect(proc);
      proc.connect(mute);
      mute.connect(s.ctx.destination);
      s.ready = true;
      s.timer = setTimeout(() => {
        if (voice.current === s) {
          closeVoice(s);
          setPhase("idle");
          setError(
            "Listening stopped after one minute. Your words are here; review them and tap Cast spell.",
          );
        }
      }, 60000);
      setWords("");
      setPhase("listening");
    } catch (err) {
      if (voice.current === s) {
        closeVoice(s);
        setPhase("idle");
        setError(describe(err));
      }
    }
  }
  async function endVoice(cancelled = false) {
    const s = voice.current;
    if (!s) return;
    if (cancelled || !s.ready) {
      closeVoice(s);
      setPhase("idle");
      if (!cancelled)
        setNotice(
          "The wand was still connecting. Hold until “Listening”, then speak.",
        );
      return;
    }
    s.ready = false;
    s.proc?.disconnect();
    s.stream?.getTracks().forEach((t) => t.stop());
    setPhase("finishing");
    try {
      const final = await s.live.endTurn();
      if (voice.current !== s) return;
      closeVoice(s);
      setPhase("idle");
      if (!final.trim()) {
        setError("The wand heard no words. Try again, or type the spell.");
        return;
      }
      setWords(final);
      await cast(final);
    } catch (err) {
      if (voice.current === s) {
        closeVoice(s);
        setPhase("idle");
        setError(describe(err));
      }
    }
  }
  const newPage = () => {
    if (busy) return;
    if (
      !empty &&
      !window.confirm(
        "Start a fresh parchment? Download your sketch first if you want to keep it. Saved images stay in the spellbook.",
      )
    )
      return;
    sketch.current?.clear();
    setWords("");
    setActive(null);
    setLast(null);
    setError("");
    setNotice("");
    setRevision((n) => n + 1);
  };
  return (
    <main
      className={`drawing-room ${settings.chamber ? "with-room" : "quiet-room"} ${settings.livePaper ? "live-paper" : ""}`}
    >
      <header className="room-header">
        <a className="wordmark" href="/" aria-label="Incant drawing room">
          <span className="brand-star">✧</span> incant
          <span className="edition">THE DRAWING ROOM</span>
        </a>
        <div className="header-actions">
          <button
            className="plain-button"
            onClick={() => setHelp(true)}
            disabled={busy}
          >
            <CircleHelp size={18} />
            <span>How to cast</span>
          </button>
          <button
            className="book-button"
            onClick={() => setBook(true)}
            disabled={busy}
          >
            <BookOpen size={18} /> Spellbook
          </button>
        </div>
      </header>
      <div className="workspace">
        <aside className="room-aside">
          <div className="aside-intro">
            <p className="eyebrow">A SMALL PRACTICE IN WONDER</p>
            <h1>
              A little ink.
              <br />A few words.
              <br />
              <em>
                A world of
                <br />
                your own.
              </em>
            </h1>
            <p>
              Draw the beginning.
              <br />
              Let a spell do the rest.
            </p>
          </div>
          <DeskArt />
          <div className="margin-note">
            <span>✧</span>
            <p>
              No perfect lines required.
              <br />
              Even wizards begin
              <br />
              with a scribble.
            </p>
          </div>
        </aside>
        <section className="desk" aria-label="Wizard's drawing desk">
          <div className="desk-top">
            <div>
              <span className="eyebrow">YOUR PARCHMENT</span>
              <span className="page-caption">
                {active
                  ? "An idea, made visible."
                  : "Something wonderful starts here."}
              </span>
            </div>
            <button className="plain-button" onClick={newPage} disabled={busy}>
              <Plus size={17} /> New page
            </button>
          </div>
          <div className="drawing-area">
            <div
              className="tool-rail"
              role="toolbar"
              aria-label="Drawing tools"
            >
              <ToolButton
                label="Quill"
                selected={tool === "quill"}
                disabled={busy || !!active}
                onClick={() => setTool("quill")}
              >
                <Feather />
              </ToolButton>
              <ToolButton
                label="Eraser"
                selected={tool === "rubber"}
                disabled={busy || !!active}
                onClick={() => setTool("rubber")}
              >
                <Eraser />
              </ToolButton>
              <span className="tool-divider" />
              <ToolButton
                label="Undo"
                disabled={busy || !!active || !sketch.current?.canUndo()}
                onClick={() => sketch.current?.undo()}
              >
                <Undo2 />
              </ToolButton>
              <ToolButton
                label="Redo"
                disabled={busy || !!active || !sketch.current?.canRedo()}
                onClick={() => sketch.current?.redo()}
              >
                <Redo2 />
              </ToolButton>
              <span className="tool-divider" />
              <ToolButton
                label="Save sketch"
                disabled={empty || busy}
                onClick={() => {
                  const png = sketch.current?.exportPng();
                  if (png) download(png, "incant-sketch.png");
                }}
              >
                <Download />
              </ToolButton>
            </div>
            <div className="paper-wrap">
              <div className="paper" aria-busy={phase === "casting"}>
                <ParchmentFrame />
                <SketchCanvas
                  ref={sketch}
                  tool={tool}
                  locked={busy || !!active}
                  className="drawing-canvas"
                  onChange={() => setRevision((n) => n + 1)}
                  onStorageError={setNotice}
                />
                {empty && !active && phase === "idle" && (
                  <div className="empty-parchment">
                    <Sigil />
                    <p>Begin with a scribble</p>
                    <span>A creature, a cottage, a place only you know.</span>
                    <small>DRAW WITH YOUR STYLUS</small>
                  </div>
                )}
                {active && (
                  <img
                    className="manifestation"
                    src={active.image}
                    alt={active.spell}
                  />
                )}
                {phase === "casting" && (
                  <div
                    className={`cast-veil ${active ? "has-result" : ""}`}
                    role="status"
                  >
                    <Sigil />
                    <p>
                      {active
                        ? "Another world is taking shape"
                        : "Your sketch is becoming…"}
                    </p>
                    <span>
                      {progress} · {elapsed}s
                    </span>
                    <small>Your original drawing is safe.</small>
                    <button
                      className="plain-button"
                      onClick={() => {
                        cancel();
                        setNotice(
                          "Stopped waiting. A request already sent may still be billed.",
                        );
                      }}
                    >
                      Stop waiting
                    </button>
                  </div>
                )}
              </div>
              <div className="paper-foot">
                <span>✦</span>
                <span>
                  {active ? "A world summoned by you" : "INK & IMAGINATION"}
                </span>
                <span>✦</span>
              </div>
            </div>
          </div>
          <div className="spell-area">
            {active && (
              <div className="result-actions">
                <button
                  className="plain-button"
                  disabled={busy}
                  onClick={() => setActive(null)}
                >
                  <ArrowLeft size={16} /> Back to sketch
                </button>
                <button
                  className="plain-button"
                  disabled={busy || !last}
                  onClick={() => void cast("", true)}
                >
                  <RotateCcw size={16} /> Another
                </button>
                <button
                  className="plain-button"
                  onClick={() =>
                    download(active.image, "incant-" + active.created + ".png")
                  }
                >
                  <Download size={16} /> Save image
                </button>
              </div>
            )}
            <label className="eyebrow" htmlFor="spell">
              {phase === "listening"
                ? "THE WAND IS LISTENING"
                : "THE INCANTATION"}
            </label>
            <div className="spell-input-row">
              <textarea
                id="spell"
                maxLength={4000}
                rows={2}
                value={words}
                disabled={busy}
                onChange={(e) => setWords(e.target.value)}
                placeholder="“A tiny cottage in a forest of enormous mushrooms…”"
              />
              <button
                className="cast-button"
                disabled={busy || !words.trim() || empty}
                onClick={() => void cast()}
              >
                <Sparkles size={19} /> Cast spell
              </button>
            </div>
            <div className="voice-row">
              <span className="spell-hint">
                Say what your drawing should become.
              </span>
              <button
                className={`voice-wand ${phase === "listening" ? "listening" : ""}`}
                disabled={phase === "casting" || phase === "finishing"}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  void beginVoice();
                }}
                onPointerUp={() => void endVoice()}
                onPointerCancel={() => void endVoice(true)}
                onLostPointerCapture={() => {
                  if (voice.current?.ready) void endVoice(true);
                }}
                onKeyDown={(e) => {
                  if ((e.key === " " || e.key === "Enter") && !e.repeat) {
                    e.preventDefault();
                    void beginVoice();
                  }
                }}
                onKeyUp={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    void endVoice();
                  }
                }}
                onBlur={() => {
                  if (voice.current?.ready || phase === "connecting")
                    void endVoice(true);
                }}
                onContextMenu={(e) => e.preventDefault()}
              >
                <Volume2 size={17} />
                {phase === "connecting"
                  ? "Connecting… keep holding"
                  : phase === "listening"
                    ? "Listening… release to cast"
                    : phase === "finishing"
                      ? "Finishing your spell…"
                      : "Hold to speak"}
                <span className="wand-glyph">⟋✧</span>
              </button>
            </div>
            {error && (
              <div role="alert" className="desk-message">
                <p>{error}</p>
                <button aria-label="Dismiss error" onClick={() => setError("")}>
                  <X size={16} />
                </button>
              </div>
            )}
            {notice && (
              <div role="status" className="desk-message">
                <p>{notice}</p>
                <button
                  aria-label="Dismiss notice"
                  onClick={() => setNotice("")}
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </div>
        </section>
        <aside className="ritual-aside">
          <div className="ritual-heading">
            THE RITUAL <span>✧</span>
          </div>
          <ol>
            <li>
              <span>01</span>
              <div>
                <h2>Make a mark</h2>
                <p>
                  Give your idea a shape.
                  <br />A few lines will do.
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h2>Speak a spell</h2>
                <p>
                  Hold the wand. Describe
                  <br />
                  what you imagine.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h2>Let it become</h2>
                <p>
                  Release, and watch your
                  <br />
                  drawing find its world.
                </p>
              </div>
            </li>
          </ol>
          <div className="spell-example">
            <p className="eyebrow">A SPELL TO BORROW</p>
            <p>
              “An ancient tree with
              <br />a door in its trunk,
              <br />
              drawn in storybook ink.”
            </p>
            <button
              className="plain-button"
              disabled={busy}
              onClick={() =>
                setWords(
                  "An ancient tree with a door in its trunk, drawn in storybook ink.",
                )
              }
            >
              Use these words <span>↗</span>
            </button>
          </div>
          <div className="desk-seal">
            <Sigil />
            <span>
              MADE FOR
              <br />
              DAYLIGHT
            </span>
          </div>
        </aside>
      </div>
      <footer className="room-footer">
        <span>
          INCANT <i>·</i> An ordinary desk for extraordinary things.
        </span>
        <span>
          {empty ? "Your next world awaits." : "Draft kept on this device."}
        </span>
      </footer>
      {creations.length > 0 && (
        <section className="collection" aria-label="Saved manifestations">
          <p className="eyebrow">
            YOUR SPELLBOOK <span>{creations.length} saved</span>
          </p>
          <div className="collection-strip">
            {creations
              .slice()
              .reverse()
              .map((c) => (
                <button
                  key={c.id}
                  disabled={busy}
                  aria-label={"Open image: " + c.spell}
                  aria-pressed={active?.id === c.id}
                  onClick={() => {
                    setActive(c);
                    setLast(
                      c.sketch ? { sketch: c.sketch, words: c.spell } : null,
                    );
                  }}
                >
                  <img src={c.image} alt="" />
                  <span>{c.spell}</span>
                </button>
              ))}
          </div>
        </section>
      )}
      <Grimoire
        imageReady={imageReady}
        voiceReady={voiceReady}
        open={book}
        settings={settings}
        onChange={setSettings}
        onClose={() => setBook(false)}
      />
      {help && <Help onClose={() => setHelp(false)} />}
      <span hidden>{revision}</span>
    </main>
  );
}
function ToolButton({
  label,
  selected,
  disabled,
  onClick,
  children,
}: {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className="tool-button"
      aria-label={label}
      title={label}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function Help({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="help-dialog"
      onCancel={onClose}
      onClose={onClose}
    >
      <p className="eyebrow">WELCOME TO THE DRAWING ROOM</p>
      <h2>A spell begins with you.</h2>
      <p>
        Sketch with a stylus or mouse. Fingers are ignored so you can rest your
        palm on the parchment.
      </p>
      <p>
        Hold <strong>Hold to speak</strong>, wait for “Listening”, then describe
        your idea. Release to cast. You can also type your words and choose{" "}
        <strong>Cast spell</strong>.
      </p>
      <p>
        Add image and voice keys in the Spellbook. Casting sends your sketch and
        words through this app’s server to OpenAI; voice audio goes to Gemini.
        Drawing works without a connection after the page has loaded.
      </p>
      <p>
        Your draft and finished images are saved in this browser. Download keeps
        a copy outside the app.
      </p>
      <button className="cast-button" onClick={onClose}>
        Let’s make something
      </button>
    </dialog>
  );
}
