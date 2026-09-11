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
  X,
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
import {
  archiveExisting,
  archiveSketch,
  archiveImage,
  archiveFolderReady,
  chooseArchiveFolder,
  directorySupported,
  downloadArchive,
  endPage,
  syncArchive,
} from "@/lib/archive";
import { Grimoire } from "./Grimoire";
import { Sigil } from "./DeskArt";
type Phase =
  "idle" | "connecting" | "listening" | "finishing" | "casting" | "renewing";
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
  const archiveDialog = useRef<HTMLDialogElement>(null);
  const [archiveError, setArchiveError] = useState("");
  const [archiveWorking, setArchiveWorking] = useState(false);
  const [turning, setTurning] = useState(false);
  const renewal = useRef(false);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const immersiveMode =
    new URLSearchParams(window.location.search).get("mode") !== "desk";
  const [frame] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get("frame");
    if (requested === "big" || requested === "balanced") {
      try {
        localStorage.setItem("incant-frame", requested);
      } catch {}
      return requested;
    }
    try {
      return localStorage.getItem("incant-frame") === "big"
        ? "big"
        : "balanced";
    } catch {
      return "balanced";
    }
  });
  const [panel, setPanel] = useState(false);
  const panelRef = useRef<HTMLDialogElement>(null);
  const room = useRef<HTMLElement>(null);
  const typeDialog = useRef<HTMLDialogElement>(null);
  const typeField = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    const fitKeyboard = () =>
      typeDialog.current?.style.setProperty(
        "--keyboard-inset",
        `${Math.max(0, window.innerHeight - (viewport?.height ?? window.innerHeight) - (viewport?.offsetTop ?? 0))}px`,
      );
    fitKeyboard();
    viewport?.addEventListener("resize", fitKeyboard);
    viewport?.addEventListener("scroll", fitKeyboard);
    return () => {
      viewport?.removeEventListener("resize", fitKeyboard);
      viewport?.removeEventListener("scroll", fitKeyboard);
    };
  }, []);
  const [loadedImage, setLoadedImage] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  useEffect(() => {
    if (panel) panelRef.current?.showModal();
    else panelRef.current?.close();
  }, [panel]);
  useEffect(() => {
    if (!revealing) return;
    const t = setTimeout(() => setRevealing(false), 2700);
    return () => clearTimeout(t);
  }, [revealing, loadedImage]);
  const voiceButton = useRef<HTMLButtonElement>(null);
  const voicePointer = useRef<number | null>(null);
  const voicePress = useRef({ started: 0, stopping: false });
  const [handsFree, setHandsFree] = useState(false);
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
  useEffect(() => {
    const button = voiceButton.current;
    if (!button) return;
    // React touch handlers are passive in Chrome. Cancel native text selection
    // on this control only; pointer events still own the hold/release lifecycle.
    const preventNativeHold = (event: Event) => event.preventDefault();
    button.addEventListener("touchstart", preventNativeHold, {
      passive: false,
    });
    button.addEventListener("contextmenu", preventNativeHold);
    button.addEventListener("selectstart", preventNativeHold);
    return () => {
      button.removeEventListener("touchstart", preventNativeHold);
      button.removeEventListener("contextmenu", preventNativeHold);
      button.removeEventListener("selectstart", preventNativeHold);
    };
  }, []);
  useEffect(() => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    if (!sketch.current || sketch.current.isEmpty() || renewal.current) return;
    draftTimer.current = setTimeout(() => {
      const png = sketch.current?.exportPng();
      if (png)
        void archiveSketch(png, words)
          .then(async (pair) => {
            if (await archiveFolderReady()) await syncArchive(pair.id);
          })
          .catch(() =>
            setArchiveError(
              "Your file archive needs attention. Tap the moon to reconnect it before starting a new page.",
            ),
          );
    }, 500);
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, [revision]);
  useEffect(() => () => turnTimers.current.forEach(clearTimeout), []);
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
        void archiveExisting(x).catch(() =>
          setArchiveError(
            "Previous spells could not be added to the file archive. They remain in your spellbook.",
          ),
        );
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
    if (voice.current === s) {
      voice.current = null;
      setHandsFree(false);
    }
  };
  const cancel = () => {
    serial.current++;
    if (voice.current) closeVoice(voice.current);
    operation.current?.abort();
    operation.current = null;
    setRevealing(false);
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
    setPanel(false);
    setRevealing(false);
    setPhase("casting");
    setProgress("Sending your sketch…");
    const timer = setTimeout(() => control.abort(), 180000);
    let successes = 0;
    try {
      if (draftTimer.current) clearTimeout(draftTimer.current);
      const pair = await archiveSketch(png, text, true);
      if (await archiveFolderReady()) await syncArchive(pair.id);
      if (id !== serial.current) return;
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
            await archiveImage(pair.id!, {
              id: item.id,
              image: item.image,
              spell: item.spell,
            });
            if (await archiveFolderReady()) await syncArchive(pair.id);
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
  const newPage = async (allowBrowserOnly = false) => {
    if (busy || renewal.current) return;
    renewal.current = true;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    try {
      const png = sketch.current?.exportPng();
      if (png && !sketch.current?.isEmpty())
        await archiveSketch(png, words, true);
      if (!allowBrowserOnly && !(await archiveFolderReady())) {
        archiveDialog.current?.showModal();
        renewal.current = false;
        return;
      }
      if (!allowBrowserOnly) await syncArchive();
      await endPage();
      setPanel(false);
      archiveDialog.current?.close();
      setPhase("renewing");
      setTurning(true);
      turnTimers.current.push(
        setTimeout(() => {
          sketch.current?.clear();
          setWords("");
          setActive(null);
          setLast(null);
          setError("");
          setNotice("");
          setRevealing(false);
          setRevision((n) => n + 1);
        }, 1100),
      );
      turnTimers.current.push(
        setTimeout(() => {
          setTurning(false);
          setPhase("idle");
          renewal.current = false;
        }, 3200),
      );
    } catch (e) {
      renewal.current = false;
      setArchiveError("The sketch has not been cleared. " + describe(e));
      archiveDialog.current?.showModal();
    }
  };
  return (
    <main
      ref={room}
      data-frame={frame}
      className={`drawing-room immersive-room ${turning ? "turning-moon" : ""} ${immersiveMode ? "immersive-mode" : ""} phase-${phase} ${revealing ? "is-revealing" : ""} ${settings.livePaper ? "live-paper" : ""}`}
    >
      <section className="desk" aria-label="Wizard's drawing desk">
        <div className="drawing-area">
          <div className="paper-wrap">
            <div
              className={`paper ${active && loadedImage === active.id ? "has-manifestation" : ""}`}
              aria-busy={phase === "casting"}
            >
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
                </div>
              )}
              {active && (
                <img
                  key={active.id}
                  className={`manifestation ${loadedImage === active.id ? "image-ready" : ""}`}
                  src={active.image}
                  alt={active.spell}
                  onLoad={() => {
                    setLoadedImage(active.id);
                    setRevealing(true);
                  }}
                  onError={() => {
                    setError(
                      "The image could not be displayed. Your sketch is safe; reopen the image from the spellbook.",
                    );
                    setLoadedImage(null);
                    setActive(null);
                  }}
                />
              )}
              {turning && <div className="day-cycle" aria-hidden="true" />}
              {(phase === "casting" ||
                revealing ||
                (!!active && loadedImage !== active.id)) && (
                <div
                  className={`spell-fog ${revealing ? "fog-clearing" : ""}`}
                  aria-hidden="true"
                >
                  <i />
                  <i />
                  <i />
                </div>
              )}
            </div>
          </div>
          {(phase === "finishing" || phase === "casting") && (
            <svg
              className="spell-flight"
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path className="spell-trail" d="M540 950 Q650 730 500 480" />
              <g className="spell-impact">
                <path d="M500 480 l-65 -70 25 5 -45 -80 M500 480 l75 -50 -10 -35 65 -45 M500 480 l-100 35 15 25 -75 40 M500 480 l65 75 -20 15 40 60" />
                <circle cx="500" cy="480" r="80" />
              </g>
            </svg>
          )}
        </div>
        <button
          className="moon-key"
          aria-label="New spell — turn the moon"
          disabled={busy || turning}
          onClick={() => void newPage()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <span className="moon-orbit" aria-hidden="true" />
        </button>
        <div className="wand-rest">
          <button
            ref={voiceButton}
            aria-label={
              immersiveMode && (phase === "casting" || phase === "finishing")
                ? "Stop spell"
                : immersiveMode && active
                  ? "Return to sketch"
                  : phase === "connecting"
                    ? handsFree
                      ? "Connecting… tap to cancel"
                      : "Connecting… keep holding"
                    : phase === "listening"
                      ? handsFree
                        ? "Listening… tap to cast"
                        : "Listening… release to cast"
                      : phase === "finishing"
                        ? "Finishing your spell…"
                        : "Tap or hold to speak"
            }
            aria-describedby="wand-status"
            className={`voice-wand ${phase === "listening" ? "listening" : ""}`}
            disabled={
              phase === "renewing" ||
              (!immersiveMode && (phase === "casting" || phase === "finishing"))
            }
            onPointerDown={(e) => {
              if (voicePointer.current !== null || e.button !== 0) return;
              e.preventDefault();
              if (
                immersiveMode &&
                (phase === "casting" || phase === "finishing")
              ) {
                cancel();
                return;
              }
              if (immersiveMode && active) {
                setActive(null);
                setRevealing(false);
                return;
              }
              voicePointer.current = e.pointerId;
              voicePress.current = {
                started: performance.now(),
                stopping: handsFree,
              };
              e.currentTarget.setPointerCapture(e.pointerId);
              if (!handsFree) void beginVoice();
            }}
            onPointerUp={(e) => {
              if (voicePointer.current !== e.pointerId) return;
              voicePointer.current = null;
              if (
                !voicePress.current.stopping &&
                performance.now() - voicePress.current.started < 300 &&
                voice.current
              ) {
                setHandsFree(true);
              } else {
                setHandsFree(false);
                void endVoice();
              }
            }}
            onPointerCancel={(e) => {
              if (voicePointer.current !== e.pointerId) return;
              voicePointer.current = null;
              void endVoice(true);
            }}
            onLostPointerCapture={(e) => {
              if (voicePointer.current !== e.pointerId) return;
              voicePointer.current = null;
              void endVoice(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                void endVoice(true);
                return;
              }
              if ((e.key === " " || e.key === "Enter") && !e.repeat) {
                e.preventDefault();
                if (
                  immersiveMode &&
                  (phase === "casting" || phase === "finishing")
                ) {
                  cancel();
                  return;
                }
                if (immersiveMode && active) {
                  setActive(null);
                  setRevealing(false);
                  return;
                }
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
              if (
                !handsFree &&
                (voice.current?.ready || phase === "connecting")
              )
                void endVoice(true);
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <Wand />
          </button>

          <p
            id="wand-status"
            className="wand-status"
            role="status"
            aria-live="polite"
          >
            {phase === "connecting"
              ? "Waking the wand…"
              : phase === "listening"
                ? handsFree
                  ? "Listening · tap to cast"
                  : "Listening"
                : phase === "finishing"
                  ? "Gathering your words…"
                  : phase === "casting"
                    ? "Your sketch is becoming…"
                    : ""}
          </p>
        </div>
        {busy && (
          <button
            className="ritual-cancel"
            onClick={() => {
              cancel();
              setNotice("Stopped. Your original sketch is safe.");
            }}
          >
            Stop waiting
          </button>
        )}
        <button
          className="desk-latch"
          aria-label="Open desk tools"
          onClick={() => setPanel(true)}
          disabled={busy}
        >
          <BookOpen size={24} />
        </button>
        <button
          className="typewriter-key"
          aria-label="Type a spell"
          disabled={busy}
          onContextMenu={(e) => e.preventDefault()}
          onClick={() => {
            // Freeze the illustrated canvas while Android resizes for the IME.
            if (room.current)
              room.current.style.height = `${room.current.getBoundingClientRect().height}px`;
            typeField.current?.setAttribute("autofocus", "");
            typeDialog.current?.showModal();
            if (document.activeElement !== typeField.current)
              typeField.current?.focus({ preventScroll: true });
          }}
        >
          <img src="/wizard-typewriter.png" alt="" draggable={false} />
        </button>
        {(error || notice) && (
          <div className="room-message" role={error ? "alert" : "status"}>
            <p>{error || notice}</p>
            <button
              aria-label="Dismiss message"
              onClick={() => {
                setError("");
                setNotice("");
              }}
            >
              <X size={18} />
            </button>
            <button onClick={() => setPanel(true)}>Open spellbook</button>
          </div>
        )}
      </section>
      <dialog
        ref={panelRef}
        className="desk-drawer"
        onCancel={() => setPanel(false)}
        onClose={() => setPanel(false)}
      >
        <div className="drawer-heading">
          <h2>The spellbook</h2>
          <button aria-label="Close desk tools" onClick={() => setPanel(false)}>
            <X />
          </button>
        </div>
        <div className="drawer-links">
          <button
            className="plain-button"
            onClick={() => void newPage()}
            disabled={busy}
          >
            <Plus size={18} />
            New page
          </button>
          <button className="plain-button" onClick={() => setHelp(true)}>
            How to cast
          </button>
          <button className="plain-button" onClick={() => setBook(true)}>
            <BookOpen size={18} />
            Spellbook
          </button>
        </div>
        <div className="tool-rail" role="toolbar" aria-label="Drawing tools">
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
        <div className="spell-area">
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
        </div>
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
      </dialog>
      <dialog
        ref={typeDialog}
        onClose={() => room.current?.style.removeProperty("height")}
        className="type-bubble"
        aria-label="Type a spell"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            typeDialog.current?.close();
            void cast();
          }}
        >
          <label htmlFor="typed-spell">What shall it become?</label>
          <button
            type="button"
            className="bubble-close"
            aria-label="Close typed spell"
            onClick={() => typeDialog.current?.close()}
          >
            <X size={18} />
          </button>
          <textarea
            ref={typeField}
            id="typed-spell"
            aria-label="Type your spell"
            rows={3}
            maxLength={4000}
            value={words}
            onChange={(e) => setWords(e.target.value)}
            placeholder="A tiny cottage beneath an enormous moon…"
          />
          <button
            type="submit"
            className="bubble-cast"
            aria-label="Cast typed spell"
            disabled={busy || empty || !words.trim()}
          >
            <Sparkles size={23} />
          </button>
        </form>
      </dialog>
      <dialog
        ref={archiveDialog}
        className="archive-dialog"
        aria-label="Keep your spell pairs"
      >
        <h2>A home for your spells</h2>
        <p>
          Choose a folder once to keep numbered sketch and image pairs in Files.
          Your current drawing will be saved before the moon turns.
        </p>
        {archiveError && <p role="alert">{archiveError}</p>}
        {directorySupported() ? (
          <button
            disabled={archiveWorking}
            onClick={async () => {
              setArchiveWorking(true);
              setArchiveError("");
              try {
                await chooseArchiveFolder();
                await newPage();
              } catch (e) {
                setArchiveError(describe(e));
              } finally {
                setArchiveWorking(false);
              }
            }}
          >
            Choose folder &amp; turn the moon
          </button>
        ) : (
          <p>
            This browser cannot write directly into a folder. Download your
            pairs as a ZIP, then unzip it in Files.
          </p>
        )}
        <button
          disabled={archiveWorking}
          onClick={async () => {
            setArchiveWorking(true);
            try {
              await downloadArchive();
              await newPage(true);
            } catch (e) {
              setArchiveError(describe(e));
            } finally {
              setArchiveWorking(false);
            }
          }}
        >
          Download pairs &amp; turn the moon
        </button>
        <button
          disabled={archiveWorking}
          onClick={() => archiveDialog.current?.close()}
        >
          Keep drawing
        </button>
      </dialog>
      <Grimoire
        imageReady={imageReady}
        voiceReady={voiceReady}
        open={book}
        settings={settings}
        onChange={setSettings}
        onClose={() => setBook(false)}
      />
      {help && <Help onClose={() => setHelp(false)} />}
      <span hidden>
        {revision}
        {elapsed}
        {progress}
      </span>
    </main>
  );
}
function Wand() {
  return (
    <svg className="enchanted-wand" viewBox="0 0 240 120" aria-hidden="true">
      <g
        className="wand-body"
        stroke="#322a20"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path
          d="M49 93 L177 28 Q184 22 187 25 Q188 28 179 32 L55 103Z"
          fill="#a48b61"
          strokeWidth="2"
        />
        <path
          d="M49 93 Q31 91 23 105 Q30 119 43 115 L66 96 59 87Z"
          fill="#534632"
          strokeWidth="2"
        />
        <path
          d="M40 98 l9 13 M48 93 l9 12 M56 90 l8 10 M73 84 l4 6 M79 81 l4 6"
          stroke="#dac7a2"
          strokeWidth="2"
        />
        <path d="M84 81 L174 31" stroke="#eadabd" />
        <circle cx="184" cy="26" r="4" fill="#fff9e5" />
      </g>
      <g className="wand-sparks" fill="none" stroke="#695539" strokeWidth="1.5">
        <path d="M184 8v9 M184 35v9 M166 26h9 M193 26h9 M171 13l6 6 M193 35l6 6" />
        <circle cx="184" cy="26" r="14" />
      </g>
    </svg>
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
        Tap the wand to start and tap again to cast, or hold it and release to
        cast. Wait for “Listening”, then describe your idea. You can also type
        your words and choose <strong>Cast spell</strong>.
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
