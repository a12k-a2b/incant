import { RealtimeVoice } from "@/lib/realtime-voice";
import { OwlMail } from "./OwlMail";
import { useNativeInteractionGuard } from "@/lib/native-interactions";
import { Onboarding, needsIntroduction } from "./Onboarding";
import { startCloudBackup } from "@/lib/cloud-backup";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BookOpen,
  Hourglass,
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
  archiveCast,
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
import { SketchPeel } from "./SketchPeel";
import { ArchiveLibrary } from "./ArchiveLibrary";
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
  stopping?: boolean;
  stopRequested?: boolean;
  talk?: RealtimeVoice;
  timer?: ReturnType<typeof setTimeout>;
};
const describe = (err: unknown) =>
  err instanceof Error
    ? err.message
    : "The spell could not finish. Please try again.";
const describeVoice = (err: unknown) => {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError" || err.name === "SecurityError")
      return "Microphone access was denied. Allow microphone access, or type your spell.";
    if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError")
      return "No microphone was found. Connect one, or type your spell.";
    if (
      err.name === "NotReadableError" ||
      err.name === "TrackStartError" ||
      err.name === "AbortError"
    )
      return "The microphone is busy or unavailable. Close other audio apps, or type your spell.";
  }
  if (
    err instanceof TypeError &&
    /failed to fetch|network|load failed/i.test(err.message)
  )
    return "The wand could not reach the voice service. Check your connection, or type your spell.";
  return describe(err);
};
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
  const [canvasReady, setCanvasReady] = useState(false);
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
  const [frameLayer] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get("layer");
    if (requested === "see-through" || requested === "foreground") {
      try {
        localStorage.setItem("incant-frame-layer", requested);
      } catch {}
      return requested;
    }
    return "see-through";
  });
  const [libraryOpen, setLibraryOpen] = useState(false);
  const libraryDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (libraryOpen) libraryDialog.current?.showModal();
    else libraryDialog.current?.close();
  }, [libraryOpen]);
  const [panel, setPanel] = useState(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("view") === "spellbook") {
      url.searchParams.delete("view");
      window.history.replaceState(window.history.state, "", url);
    }
  }, []);
  const panelRef = useRef<HTMLDialogElement>(null);
  const room = useRef<HTMLElement>(null);
  useNativeInteractionGuard(room);
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
  const suppressVoiceClickUntil = useRef(0);
  const voicePress = useRef({ started: 0, stopping: false });
  const [handsFree, setHandsFreeState] = useState(false);
  const handsFreeRef = useRef(false);
  const setHandsFree = (v: boolean) => {
    handsFreeRef.current = v;
    setHandsFreeState(v);
  };
  const [striking, setStriking] = useState(false);
  const strikeRun = useRef<Promise<void> | null>(null);
  const strikeEpoch = useRef(0);
  const resetStrike = () => {
    strikeEpoch.current++;
    strikeRun.current = null;
    setStriking(false);
  };
  const fireWand = () => {
    if (strikeRun.current) return strikeRun.current;
    const epoch = ++strikeEpoch.current;
    setStriking(true);
    return (strikeRun.current = new Promise<void>((resolve) => {
      setTimeout(() => {
        if (strikeEpoch.current === epoch) setStriking(false);
        resolve();
      }, 900);
    }));
  };
  const voiceSketch = useRef<string | null>(null);
  const voiceSource = useRef<Creation | null>(null);
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
    [, redrawCanvasState] = useState(0),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [dragonAwake, setDragonAwake] = useState(false);
  const dragonTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => dragonTimers.current.forEach(clearTimeout), []);
  const wakeDragon = () => {
    setDragonAwake(true);
    dragonTimers.current.push(setTimeout(() => setBook(true), 350));
    dragonTimers.current.push(setTimeout(() => setDragonAwake(false), 1400));
  };
  const [book, setBook] = useState(false),
    [help, setHelp] = useState(needsIntroduction),
    [creations, setCreations] = useState<Creation[]>([]),
    [active, setActive] = useState<Creation | null>(null);
  const [elapsed, setElapsed] = useState(0),
    [progress, setProgress] = useState(""),
    [last, setLast] = useState<{
      sketch: string;
      words: string;
      source?: Creation | null;
    } | null>(null);
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
    if (
      !canvasReady ||
      !sketch.current ||
      sketch.current.isEmpty() ||
      renewal.current
    )
      return;
    const savePreview = () => {
      // Editable strokes are already saved locally. PNG encoding is only an
      // archive preview and must not interrupt the next in-progress stroke.
      if (sketch.current?.isDrawing()) {
        draftTimer.current = setTimeout(savePreview, 500);
        return;
      }
      const png = sketch.current?.exportPng();
      if (png)
        void archiveSketch(png, words)
          .then(async (pair) => {
            void archiveFolderReady()
              .then((ready) => (ready ? syncArchive(pair.id) : undefined))
              .catch(() => {});
          })
          .catch(() =>
            setArchiveError(
              "Your file archive needs attention. Tap the moon to reconnect it before starting a new page.",
            ),
          );
    };
    draftTimer.current = setTimeout(savePreview, 500);
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, [revision]);
  useEffect(() => () => turnTimers.current.forEach(clearTimeout), []);
  useEffect(() => startCloudBackup(), []);
  const busy = phase !== "idle" || !canvasReady,
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
    voicePointer.current = null;
    suppressVoiceClickUntil.current = performance.now() + 500;
    s.controller.abort();
    s.proc?.disconnect();
    s.stream?.getTracks().forEach((t) => t.stop());
    void s.ctx?.close().catch(() => {});
    s.live.disconnect();
    s.talk?.close();
    if (voice.current === s) {
      voice.current = null;
      setHandsFree(false);
    }
  };
  const clearVoiceSource = (restore = false) => {
    if (restore) resetStrike();
    const source = voiceSource.current;
    voiceSketch.current = null;
    voiceSource.current = null;
    if (restore && source) setActive(source);
  };
  const cancel = () => {
    serial.current++;
    if (voice.current) closeVoice(voice.current);
    operation.current?.abort();
    operation.current = null;
    setRevealing(false);
    resetStrike();
    voicePointer.current = null;
    clearVoiceSource(true);
    setPhase("idle");
    setProgress("");
  };
  useEffect(() => {
    const hidden = () => {
      if (!document.hidden) return;
      voicePointer.current = null;
      suppressVoiceClickUntil.current = performance.now() + 500;
      if (voice.current) {
        closeVoice(voice.current);
        clearVoiceSource(true);
        setPhase("idle");
        setNotice("Listening stopped when you left the desk.");
      }
    };
    const pageHidden = () => {
      voicePointer.current = null;
      suppressVoiceClickUntil.current = performance.now() + 500;
      if (voice.current) {
        closeVoice(voice.current);
        clearVoiceSource(true);
        setPhase("idle");
      }
    };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", pageHidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", pageHidden);
      if (voice.current) closeVoice(voice.current);
      operation.current?.abort();
    };
  }, []);
  async function cast(spell = words, again = false) {
    if (operation.current || renewal.current) return;
    const source = again
        ? active || last?.source || null
        : voiceSource.current || active,
      png = again
        ? last?.sketch
        : voiceSketch.current || active?.sketch || sketch.current?.exportPng(),
      text = (again ? last?.words : spell)?.trim();
    if (
      !png ||
      (!again &&
        !voiceSketch.current &&
        !active?.sketch &&
        sketch.current?.isEmpty())
    ) {
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
    setLast({ sketch: png, words: text, source });
    setWords(text);
    setError("");
    setPanel(false);
    setRevealing(false);
    setActive(null);
    // Dictation has already fired on release. Typed/repeat casts fire here.
    if (!voiceSketch.current) resetStrike();
    const strike = fireWand();
    setPhase("casting");
    setProgress("Sending your sketch…");
    const timer = setTimeout(() => control.abort(), 180000);
    let successes = 0;
    try {
      if (draftTimer.current) clearTimeout(draftTimer.current);
      const pair = await archiveCast(png, text, source);
      void archiveFolderReady()
        .then((ready) => (ready ? syncArchive(pair.id) : undefined))
        .catch(() => {});
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
          await strike;
          if (id !== serial.current) return;
          const item = {
            id: crypto.randomUUID(),
            image,
            sketch: png,
            spell: text,
            created: Date.now(),
            archivePairId: pair.id,
            archiveBundleId: pair.bundleId,
          };
          successes++;
          setCreations((prev) => [...prev, item]);
          if (successes === 1) {
            setActive(item);
            setLast((previous) =>
              previous ? { ...previous, source: item } : previous,
            );
          }
          setProgress(`${successes} of ${count} images ready`);
          try {
            await archiveImage(pair.id!, {
              id: item.id,
              image: item.image,
              spell: item.spell,
            });
            void archiveFolderReady()
              .then((ready) => (ready ? syncArchive(pair.id) : undefined))
              .catch(() => {});
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
        clearVoiceSource();
        setStriking(false);
        setPhase("idle");
        setProgress("");
      }
    }
  }
  async function beginVoice() {
    if (busy || renewal.current || voice.current || operation.current) return;
    if (empty && !active?.sketch) {
      setError("Draw a few lines first, then hold the wand and speak.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        "Voice needs a secure connection and microphone access. You can still type your spell.",
      );
      return;
    }
    resetStrike();
    voiceSource.current = active;
    voiceSketch.current = active?.sketch || sketch.current?.exportPng() || null;
    setActive(null);
    setRevealing(false);
    const s: Voice = {
      live: new GeminiLiveTranscribe(),
      controller: new AbortController(),
      ready: false,
    };
    voice.current = s;
    setNotice("");
    setError("");
    setPhase("connecting");
    try {
      if (settings.voiceMode === "conversation") {
        s.talk = new RealtimeVoice(
          (text) => {
            if (voice.current === s && text.trim()) setWords(text);
          },
          (spell) => {
            if (voice.current !== s) return;
            closeVoice(s);
            setPhase("idle");
            setWords(spell);
            void cast(spell);
          },
          (err) => {
            if (voice.current === s) {
              closeVoice(s);
              clearVoiceSource(true);
              setPhase("idle");
              setError(err.message);
            }
          },
        );
        await s.talk.connect(settings.openaiKey, voiceSketch.current);
        if (voice.current !== s) return;
        s.ready = true;
        setPhase("listening");
        s.timer = setTimeout(() => {
          if (voice.current === s) {
            closeVoice(s);
            clearVoiceSource(true);
            setPhase("idle");
            setNotice(
              "The talking wand has rested after three minutes. Tap to begin again.",
            );
          }
        }, 180000);
        if (s.stopRequested) void endVoice();
        return;
      }
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
      const queued: Int16Array[] = [];
      let queuedSamples = 0;
      s.ctx = new AudioContext();
      await s.ctx.resume();
      if (voice.current !== s) {
        void s.ctx.close();
        return;
      }
      const source = s.ctx.createMediaStreamSource(stream),
        proc = s.ctx.createScriptProcessor(2048, 1, 1);
      s.proc = proc;
      proc.onaudioprocess = (e) => {
        if (s.stopRequested) return;
        const pcm = downsampleTo16k(
          e.inputBuffer.getChannelData(0),
          s.ctx!.sampleRate,
        );
        if (s.ready) s.live.sendPcm16(pcm);
        else if (queuedSamples < 16_000 * 15) {
          queued.push(pcm);
          queuedSamples += pcm.length;
        }
      };
      const mute = s.ctx.createGain();
      mute.gain.value = 0;
      source.connect(proc);
      proc.connect(mute);
      mute.connect(s.ctx.destination);
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
        if (voice.current === s && text.trim()) setWords(text);
      });
      if (voice.current !== s) return;
      s.live.startTurn();
      s.ready = true;
      for (const pcm of queued) s.live.sendPcm16(pcm);
      queued.length = 0;
      s.timer = setTimeout(() => {
        if (voice.current === s) {
          closeVoice(s);
          setPhase("idle");
          clearVoiceSource(true);
          setError(
            "Listening stopped after one minute. Your words are here; review them and tap Cast spell.",
          );
        }
      }, 60000);
      setPhase("listening");
      if (s.stopRequested) void endVoice();
    } catch (err) {
      if (voice.current === s) {
        closeVoice(s);
        setPhase("idle");
        clearVoiceSource(true);
        setError(describeVoice(err));
      }
    }
  }
  async function endVoice(cancelled = false) {
    const s = voice.current;
    if (!s || (!cancelled && s.stopping)) return;
    if (!cancelled) {
      void fireWand();
      setPhase("finishing");
    }
    if (!cancelled && !s.ready) {
      s.stopRequested = true;
      setNotice("Gathering your voice while the wand connects…");
      return;
    }
    if (cancelled) {
      resetStrike();
      closeVoice(s);
      clearVoiceSource(true);
      setPhase("idle");
      return;
    }
    s.stopping = true;
    setNotice("");
    s.ready = false;
    if (s.talk) {
      setPhase("finishing");
      s.talk.finish();
      return;
    }
    s.proc?.disconnect();
    s.stream?.getTracks().forEach((t) => t.stop());
    setPhase("finishing");
    try {
      const final = await s.live.endTurn();
      if (voice.current !== s) return;
      closeVoice(s);
      setPhase("idle");
      if (!final.trim()) {
        clearVoiceSource(true);
        setError("The wand heard no words. Try again, or type the spell.");
        return;
      }
      setWords(final);
      await cast(final);
    } catch (err) {
      if (voice.current === s) {
        closeVoice(s);
        setPhase("idle");
        clearVoiceSource(true);
        setError(describeVoice(err));
      }
    }
  }
  const newPage = async () => {
    if (busy || renewal.current) return;
    renewal.current = true;
    // Lock drawing and every other action while durability/archive work is
    // pending. The visual moon turn begins only after those writes succeed.
    setPhase("renewing");
    if (draftTimer.current) clearTimeout(draftTimer.current);
    try {
      // A synthetic activation or unusual input chord can reach this action
      // before pointerup. Commit that legitimate ink before reading/archiving.
      sketch.current?.commitCurrent();
      await sketch.current?.flush();
      const png = sketch.current?.exportPng();
      if (png && !sketch.current?.isEmpty())
        await archiveSketch(png, words, true);
      await endPage();
      // An optional Files mirror must never interrupt an already-saved new page.
      void archiveFolderReady()
        .then((ready) => (ready ? syncArchive() : undefined))
        .catch(() => {});
      setPanel(false);
      archiveDialog.current?.close();
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
      setPhase("idle");
      setArchiveError("The sketch has not been cleared. " + describe(e));
      archiveDialog.current?.showModal();
    }
  };
  return (
    <main
      ref={room}
      data-voice-mode={settings.voiceMode}
      data-cast-stage={striking ? "strike" : revealing ? "reveal" : phase}
      data-native-interactions
      data-frame={frame}
      data-frame-layer={frameLayer}
      className={`drawing-room immersive-room ${turning ? "turning-moon" : ""} ${immersiveMode ? "immersive-mode" : ""} phase-${phase} ${revealing ? "is-revealing" : ""} ${settings.livePaper ? "live-paper" : ""}`}
    >
      <OwlMail active={active} busy={busy} mode={settings.owlMode} />
      <button
        className={`dragon-key ${dragonAwake || book ? "dragon-awake" : ""}`}
        aria-label="Dragon settings"
        disabled={busy}
        onClick={wakeDragon}
      >
        <span className="dragon-eye" aria-hidden="true" />
      </button>
      {dragonAwake && (
        <svg
          className="dragon-flame"
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <radialGradient id="dragon-fire">
              <stop stopColor="#fff1ad" />
              <stop offset=".5" stopColor="#d89c49" />
              <stop offset="1" stopColor="#a8592800" />
            </radialGradient>
          </defs>
          <path
            fill="url(#dragon-fire)"
            d="M235 870 Q180 740 340 650 Q280 530 510 400 Q440 590 700 430 Q640 750 235 870Z"
          />
        </svg>
      )}
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
                onVisualChange={() => redrawCanvasState((n) => n + 1)}
                onChange={() => setRevision((n) => n + 1)}
                onReady={() => setCanvasReady(true)}
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
                  draggable={false}
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
              {active?.sketch &&
                loadedImage === active.id &&
                !busy &&
                !revealing && (
                  <SketchPeel
                    key={"peel-" + active.id}
                    source={active.sketch}
                    controlHost={room.current}
                  />
                )}
              {turning && <div className="day-cycle" aria-hidden="true" />}
              {(((phase === "casting" || phase === "finishing") && !striking) ||
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
          {(striking || phase === "finishing" || phase === "casting") && (
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
        <button
          className="spellbooks-key"
          aria-label="Open saved spells"
          disabled={busy}
          onContextMenu={(e) => e.preventDefault()}
          onClick={() => setLibraryOpen(true)}
        />
        {phase === "casting" && (
          <button
            className="casting-hourglass"
            aria-label="Stop casting spell"
            onContextMenu={(e) => e.preventDefault()}
            onClick={() => {
              cancel();
              setNotice("Stopped. Your sketch is safe.");
            }}
          >
            <Hourglass aria-hidden="true" size={36} />
          </button>
        )}
        <div className="wand-rest">
          <button
            ref={voiceButton}
            aria-label={
              immersiveMode && (phase === "casting" || phase === "finishing")
                ? "Stop spell"
                : phase === "connecting"
                  ? handsFree
                    ? "Connecting… tap to finish"
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
              suppressVoiceClickUntil.current = performance.now() + 500;
              if (
                immersiveMode &&
                (phase === "casting" || phase === "finishing")
              ) {
                cancel();
                return;
              }
              e.currentTarget.focus({ preventScroll: true });
              voicePointer.current = e.pointerId;
              voicePress.current = {
                started: e.timeStamp,
                stopping: handsFreeRef.current,
              };
              e.currentTarget.setPointerCapture(e.pointerId);
              if (!handsFreeRef.current) void beginVoice();
            }}
            onPointerUp={(e) => {
              suppressVoiceClickUntil.current = performance.now() + 500;
              if (voicePointer.current !== e.pointerId) return;
              voicePointer.current = null;
              if (
                !voicePress.current.stopping &&
                e.timeStamp - voicePress.current.started < 450 &&
                voice.current
              ) {
                setHandsFree(true);
              } else {
                setHandsFree(false);
                void endVoice();
              }
            }}
            onPointerCancel={(e) => {
              suppressVoiceClickUntil.current = performance.now() + 500;
              if (voicePointer.current !== e.pointerId) return;
              voicePointer.current = null;
              void endVoice(true);
            }}
            onLostPointerCapture={(e) => {
              suppressVoiceClickUntil.current = performance.now() + 500;
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
                suppressVoiceClickUntil.current = performance.now() + 500;
                if (
                  immersiveMode &&
                  (phase === "casting" || phase === "finishing")
                ) {
                  cancel();
                  return;
                }
                voicePress.current = {
                  started: e.timeStamp,
                  stopping: handsFreeRef.current,
                };
                if (!handsFreeRef.current) void beginVoice();
              }
            }}
            onKeyUp={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                suppressVoiceClickUntil.current = performance.now() + 500;
                if (
                  !voicePress.current.stopping &&
                  e.timeStamp - voicePress.current.started < 450 &&
                  voice.current
                ) {
                  setHandsFree(true);
                } else {
                  setHandsFree(false);
                  void endVoice();
                }
              }
            }}
            onBlur={() => {
              voicePointer.current = null;
              suppressVoiceClickUntil.current = performance.now() + 500;
              if (
                !handsFreeRef.current &&
                (voice.current?.ready || phase === "connecting")
              )
                void endVoice(true);
            }}
            onClick={() => {
              // Pointer and keyboard lifecycles above own their generated click.
              // A standalone semantic click (HTMLElement.click/accessibility
              // activation) has no down/up events, so give it tap/tap behavior.
              if (performance.now() <= suppressVoiceClickUntil.current) return;
              if (
                immersiveMode &&
                (phase === "casting" || phase === "finishing")
              ) {
                cancel();
                return;
              }
              if (voice.current) {
                setHandsFree(false);
                void endVoice();
                return;
              }
              void beginVoice();
              if (voice.current) setHandsFree(true);
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
                ? settings.voiceMode === "conversation"
                  ? "Talk with the wand · tap to cast"
                  : handsFree
                    ? "Listening · tap to cast"
                    : "Listening · speak your spell"
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
        {immersiveMode && (
          <button
            className="room-help"
            aria-label="Show introduction"
            disabled={busy}
            onClick={() => { setPanel(false); setHelp(true); }}
          >
            <span aria-hidden="true">?</span>
          </button>
        )}
      </section>
      <dialog
        ref={libraryDialog}
        className="saved-spells-dialog"
        aria-label="Your saved spells"
        onCancel={() => setLibraryOpen(false)}
        onClose={() => setLibraryOpen(false)}
      >
        <header>
          <h2>
            <span className="wax-seal" aria-hidden="true">
              ✦
            </span>{" "}
            Your spellbook
          </h2>
          <button
            aria-label="Close saved spells"
            onClick={() => setLibraryOpen(false)}
          >
            <X />
          </button>
        </header>
        <ArchiveLibrary
          open={libraryOpen}
          creations={creations}
          busy={busy}
          onOpen={(c) => {
            setActive(c);
            setLast(
              c.sketch ? { sketch: c.sketch, words: c.spell, source: c } : null,
            );
            setLibraryOpen(false);
          }}
        />
      </dialog>
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
          <button className="plain-button" onClick={() => { setPanel(false); setHelp(true); }}>
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
              disabled={busy || !words.trim() || (empty && !active?.sketch)}
              onClick={() => void cast()}
            >
              <Sparkles size={19} /> Cast spell
            </button>
          </div>
        </div>
        <button
          onClick={() => {
            setArchiveError("");
            archiveDialog.current?.showModal();
          }}
        >
          Export spellbook
        </button>
        <ArchiveLibrary
          open={panel}
          creations={creations}
          busy={busy}
          onOpen={(c) => {
            setActive(c);
            setLast(
              c.sketch ? { sketch: c.sketch, words: c.spell, source: c } : null,
            );
          }}
        />
      </dialog>
      <dialog
        ref={typeDialog}
        onClose={() => {
          typeField.current?.removeAttribute("autofocus");
          if (document.activeElement === typeField.current)
            typeField.current?.blur();
          room.current?.style.removeProperty("height");
        }}
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
            disabled={busy || (empty && !active?.sketch) || !words.trim()}
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
        <h2>
          {archiveError ? "Your sketch is still here" : "Export your spellbook"}
        </h2>
        <p>
          Sketches and their generations save automatically inside Incant on
          this device. Export a copy whenever you want.
        </p>
        {archiveError && (
          <>
            <p role="alert">{archiveError}</p>
            <button onClick={() => void newPage()}>
              Retry saving &amp; turn the moon
            </button>
          </>
        )}
        {directorySupported() ? (
          <button
            disabled={archiveWorking}
            onClick={async () => {
              setArchiveWorking(true);
              setArchiveError("");
              try {
                await chooseArchiveFolder();
                archiveDialog.current?.close();
              } catch (e) {
                setArchiveError(describe(e));
              } finally {
                setArchiveWorking(false);
              }
            }}
          >
            Choose export folder
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
              archiveDialog.current?.close();
            } catch (e) {
              setArchiveError(describe(e));
            } finally {
              setArchiveWorking(false);
            }
          }}
        >
          Download spellbook ZIP
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
        onReturnToDrawing={
          active && phase === "idle"
            ? () => {
                setActive(null);
                setRevealing(false);
                setBook(false);
              }
            : undefined
        }
        onUndo={
          !active && phase === "idle"
            ? () => {
                sketch.current?.undo();
                setBook(false);
              }
            : undefined
        }
        onRedo={
          !active && phase === "idle"
            ? () => {
                sketch.current?.redo();
                setBook(false);
              }
            : undefined
        }
        onSaveSketch={
          !active && !empty && phase === "idle"
            ? () => {
                const png = sketch.current?.exportPng();
                if (png) download(png, "incant-sketch.png");
                setBook(false);
              }
            : undefined
        }
        canUndo={!active && phase === "idle" && !!sketch.current?.canUndo()}
        canRedo={!active && phase === "idle" && !!sketch.current?.canRedo()}
      />
      {help && <Onboarding onClose={() => setHelp(false)} />}
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
        className="wand-magic"
        fill="none"
        stroke="#86bde3"
        strokeWidth="1.25"
        strokeLinecap="round"
      >
        <path d="M74 76l8-7-2 6 12-8 M112 56l9-8-2 6 10-6 M155 34l8-7-1 6 10-7" />
        <path d="M97 89l7-6-1 5 9-6 M143 65l7-8-1 6 10-8 M186 17l4-5-1 5 5-3" />
      </g>
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
      <g
        className="wand-feedback"
        fill="none"
        stroke="#45341f"
        strokeWidth="2.5"
        aria-hidden="true"
      >
        <circle className="wand-wave wand-wave-one" cx="184" cy="26" r="19" />
        <circle className="wand-wave wand-wave-two" cx="184" cy="26" r="19" />
        <path
          className="wand-ready-sigil"
          d="M184 12l4 10 10 4-10 4-4 10-4-10-10-4 10-4z"
          fill="#fff4d6"
        />
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
