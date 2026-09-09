import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import {
  Eraser,
  Feather,
  RotateCcw,
  Settings2,
  Undo2,
  Redo2,
  FileText,
} from "lucide-react";
import { GeminiLiveTranscribe, downsampleTo16k } from "@/lib/gemini-live";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type IncantSettings,
} from "@/lib/settings";
import { cn } from "@/lib/utils";
import { ChamberShell, WellFittings } from "./Chamber";
import { Echoes } from "./Echoes";
import { Grimoire } from "./Grimoire";
import { OwlPost } from "./OwlPost";
import { SketchCanvas, type SketchCanvasHandle, type Tool } from "./SketchCanvas";
import { SpellOverlay, type SpellPhase } from "./SpellOverlay";
import { Wand } from "./Wand";
import { sendByOwl } from "@/lib/owl-post";

type CastOk = { ok: true; imageBase64: string; mime: string };
type CastFail = { ok: false; error: string };

function toSrc(imageBase64: string, mime = "image/png") {
  if (imageBase64.startsWith("data:")) return imageBase64;
  return `data:${mime};base64,${imageBase64}`;
}

async function mintGeminiToken(geminiKey?: string): Promise<string> {
  const res = await fetch("/api/gemini-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ geminiKey: geminiKey ?? "" }),
  });
  const body = (await res.json()) as { ok: boolean; token?: string; error?: string };
  if (!body.ok || !body.token) {
    throw new Error(body.error || "The wand could not open a listening circle.");
  }
  return body.token;
}

async function requestCast(payload: {
  openaiKey: string;
  sketchPngBase64: string;
  incantation: string;
  livePaper: boolean;
  variationIndex: number;
  quality: IncantSettings["quality"];
  model: IncantSettings["model"];
}): Promise<CastOk | CastFail> {
  const res = await fetch("/api/cast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return (await res.json()) as CastOk | CastFail;
}

export function IncantApp() {
  const sketchRef = useRef<SketchCanvasHandle>(null);
  const transcribe = useRef(new GeminiLiveTranscribe());
  const audioCtx = useRef<AudioContext | null>(null);
  const processor = useRef<ScriptProcessorNode | null>(null);
  const media = useRef<MediaStream | null>(null);
  const holdLock = useRef(false);

  const [settings, setSettings] = useState<IncantSettings>(DEFAULT_SETTINGS);
  const [tool, setTool] = useState<Tool>("quill");
  const [phase, setPhase] = useState<SpellPhase>("idle");
  const [held, setHeld] = useState(false);
  const [flicking, setFlicking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [draft, setDraft] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const [error, setError] = useState("");
  const [owlNote, setOwlNote] = useState("");
  const [owlFlying, setOwlFlying] = useState(false);
  const [grimoire, setGrimoire] = useState(false);
  const [help, setHelp] = useState(true);
  const [tick, setTick] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = loadSettings();
    setSettings(stored);
    try {
      setHelp(window.localStorage.getItem("incant-seen-help") !== "1");
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveSettings(settings);
  }, [settings, ready]);

  const bump = () => setTick((n) => n + 1);

  const lastIncantation = useRef("");
  const lastSketch = useRef("");

  const stopMic = useCallback(() => {
    processor.current?.disconnect();
    processor.current = null;
    media.current?.getTracks().forEach((t) => t.stop());
    media.current = null;
    void audioCtx.current?.close();
    audioCtx.current = null;
  }, []);

  useEffect(() => () => {
    stopMic();
    transcribe.current.disconnect();
  }, [stopMic]);

  const startMic = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    media.current = stream;
    const ctx = new AudioContext();
    audioCtx.current = ctx;
    if (ctx.state === "suspended") await ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(2048, 1, 1);
    processor.current = proc;
    proc.onaudioprocess = (ev) => {
      const input = ev.inputBuffer.getChannelData(0);
      const pcm = downsampleTo16k(input, ctx.sampleRate);
      transcribe.current.sendPcm16(pcm);
    };
    const mute = ctx.createGain();
    mute.gain.value = 0;
    source.connect(proc);
    proc.connect(mute);
    mute.connect(ctx.destination);
  }, []);

  const runCasts = useCallback(
    async (
      sketch: string,
      incantation: string,
      variationOffset = 0,
      count = 1,
    ) => {
      lastIncantation.current = incantation;
      lastSketch.current = sketch;

      const jobs = Array.from({ length: count }, (_, i) =>
        requestCast({
          openaiKey: settings.openaiKey,
          sketchPngBase64: sketch,
          incantation,
          livePaper: settings.livePaper,
          variationIndex: variationOffset + i,
          quality: settings.quality,
          model: settings.model,
        }).then((result) => ({ index: variationOffset + i, result })),
      );

      await new Promise<void>((resolve, reject) => {
        let remaining = count;
        let gotOne = false;
        let lastErr = "";
        for (const job of jobs) {
          void job.then(({ result }) => {
            if (result.ok) {
              const src = toSrc(result.imageBase64, result.mime);
              setImages((prev) => {
                if (prev.includes(src)) return prev;
                const next = [...prev, src];
                if (!gotOne) setActive(next.length - 1);
                return next;
              });
              if (!gotOne) {
                gotOne = true;
                resolve();
              }
            } else {
              lastErr = result.error;
            }
            remaining -= 1;
            if (remaining === 0 && !gotOne) {
              reject(new Error(lastErr || "The spell returned nothing."));
            }
          });
        }
      });
    },
    [settings],
  );

  const playCastSequence = useCallback(async (fromReroll: boolean) => {
    const sketch = sketchRef.current?.exportPng();
    if (!sketch) throw new Error("The parchment is empty.");

    const words = (transcript || draft).trim();
    if (!fromReroll && !words) {
      throw new Error("Speak or write an incantation before you cast.");
    }
    const incantation = fromReroll ? lastIncantation.current || words : words;

    if (!fromReroll) {
      setImages([]);
      setActive(0);
    }

    setFlicking(true);
    setPhase("flicking");
    await wait(520);
    setFlicking(false);
    setPhase("dissolving");
    await wait(720);
    setPhase("gathering");

    const count = fromReroll ? 1 : settings.fourfold ? 4 : 1;
    const offset = fromReroll ? images.length : 0;
    await runCasts(fromReroll ? lastSketch.current || sketch : sketch, incantation, offset, count);

    setPhase("manifesting");
    await wait(1200);
    setPhase("manifested");
  }, [draft, images.length, runCasts, settings.fourfold, settings.openaiKey, transcript]);

  const beginHold = async (e: PointerEvent<HTMLButtonElement>) => {
    if (phase !== "idle" && phase !== "fizzled" && phase !== "manifested") return;
    if (holdLock.current) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    holdLock.current = true;
    setHeld(true);
    setPhase("incanting");
    setError("");
    if (phase === "manifested") {
      /* keep image until they actually cast */
    }

    try {
      const token = await mintGeminiToken(settings.geminiKey);
      await transcribe.current.connect(token, (text) => {
        setTranscript(text);
      });
      transcribe.current.startTurn();
      await startMic();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "The wand could not hear. You can still write the spell.",
      );
    }
  };

  const endHold = async (e: PointerEvent<HTMLButtonElement>) => {
    if (!holdLock.current) return;
    holdLock.current = false;
    setHeld(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    let spoken = transcript;
    try {
      if (transcribe.current.connected) {
        spoken = await transcribe.current.endTurn();
        if (spoken) setTranscript(spoken);
      }
    } catch {
      /* keep existing transcript */
    }
    stopMic();

    const words = (spoken || transcript || draft).trim();
    if (!words) {
      setPhase("idle");
      setError("The wand heard silence. Hold again and speak, or write the spell.");
      return;
    }
    if (!sketchRef.current || sketchRef.current.isEmpty()) {
      setPhase("idle");
      setError("Draw on the parchment first.");
      return;
    }

    try {
      await playCastSequence(false);
    } catch (err) {
      setPhase("fizzled");
      setError(err instanceof Error ? err.message : "The spell fizzled.");
    }
  };

  const reroll = async () => {
    if (phase === "gathering" || phase === "flicking" || phase === "dissolving") return;
    if (!lastSketch.current && sketchRef.current?.isEmpty()) return;
    setError("");
    try {
      await playCastSequence(true);
    } catch (err) {
      setPhase("fizzled");
      setError(err instanceof Error ? err.message : "The reshuffle fizzled.");
    }
  };

  const backToSketch = () => {
    setPhase("idle");
    setFlicking(false);
  };

  const dispatchOwl = async () => {
    const src = images[active] ?? images[0];
    if (!src || busy) return;
    setOwlFlying(true);
    window.setTimeout(() => setOwlFlying(false), 560);
    setOwlNote("");
    try {
      const flight = await sendByOwl({
        imageSrc: src,
        incantation: lastIncantation.current || transcript || draft,
      });
      if (flight === "shared") {
        setOwlNote("The owl is away.");
      } else if (flight === "mailed") {
        setOwlNote("Missive opened. Attach the visage if the owl dropped it.");
      }
    } catch {
      setOwlNote("The owl refused the letter. Try again.");
    }
  };

  const newParchment = () => {
    sketchRef.current?.clear();
    setImages([]);
    setActive(0);
    setTranscript("");
    setDraft("");
    setError("");
    setOwlNote("");
    setPhase("idle");
    lastIncantation.current = "";
    lastSketch.current = "";
    bump();
  };

  const dismissHelp = () => {
    setHelp(false);
    try {
      window.localStorage.setItem("incant-seen-help", "1");
    } catch {
      /* ignore */
    }
  };

  const busy =
    phase === "flicking" ||
    phase === "dissolving" ||
    phase === "gathering" ||
    phase === "manifesting";
  const showingResult = phase === "manifested" || phase === "manifesting";
  const wandLabel = held
    ? "Release to cast"
    : showingResult
      ? "Hold to recast"
      : "Hold to incant";

  if (help) {
    return (
      <div
        className={cn(
          "incant-stage flex flex-col justify-between overflow-y-auto",
          settings.chamber ? "is-chamber chamber-help text-parchment" : "paper-grain bg-parchment text-ink",
        )}
      >
        {settings.chamber ? <ChamberShell /> : null}
        <div className="chamber-body justify-between px-7 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
        <div>
          <div className={settings.chamber ? "chamber-plate" : undefined}>
            <p className={cn("font-display text-[0.7rem] uppercase tracking-[0.28em]", settings.chamber ? "text-oak-deep" : "text-ink")}>
              Incant
            </p>
            <p className={cn("mt-1 font-body text-base italic", settings.chamber ? "text-oak" : "text-ash")}>
              A wizard's canvas
            </p>
          </div>
          <div className="engraved-rule my-5" />
          <p className={cn("font-display text-[0.7rem] uppercase tracking-[0.24em]", settings.chamber ? "text-brass-bright" : "text-ash")}>
            How to weave
          </p>
          <ol className={cn("mt-4 space-y-3 font-body text-lg leading-snug", settings.chamber ? "text-parchment" : "text-ink")}>
            <li>Draw with the stylus. Palms rest; they are ignored.</li>
            <li>Hold the wand and speak what the sketch should become.</li>
            <li>Release. The spell hits the page and transfigures it.</li>
            <li>If the visage is wrong, tap Another for a new reading.</li>
            <li>Tap the owl to send it by post — email, or wherever owls go.</li>
          </ol>
        </div>
        <button
          type="button"
          onClick={dismissHelp}
          className={cn(
            "h-12 w-full rounded-sm bg-ink font-display text-[0.72rem] uppercase tracking-[0.2em] text-parchment transition-transform duration-150 active:scale-[0.96]",
            settings.chamber && "help-open",
          )}
        >
          {settings.chamber ? "Open the cabinet" : "Open the parchment"}
        </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "incant-stage flex flex-col text-ink",
        settings.chamber ? "is-chamber" : "paper-grain",
      )}
    >
      {settings.chamber ? <ChamberShell /> : null}
      <div className="chamber-body">
      <header className="flex items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className={settings.chamber ? "chamber-plate" : undefined}>
          <p className="font-display text-[0.7rem] uppercase tracking-[0.28em]">
            Incant
          </p>
          <p className={cn("font-body text-sm italic", settings.chamber ? "text-oak" : "text-ash")}>
            A wizard's canvas
          </p>
        </div>
        <div className="flex items-center gap-1">
          <IconBtn label="Undo" onClick={() => { sketchRef.current?.undo(); bump(); }}>
            <Undo2 className="size-5" strokeWidth={1.5} />
          </IconBtn>
          <IconBtn label="Redo" onClick={() => { sketchRef.current?.redo(); bump(); }}>
            <Redo2 className="size-5" strokeWidth={1.5} />
          </IconBtn>
          <IconBtn label="Grimoire" onClick={() => setGrimoire(true)}>
            <Settings2 className="size-5" strokeWidth={1.5} />
          </IconBtn>
        </div>
      </header>
      <div className="engraved-rule mx-6" />

      <section
        className={cn(
          "relative mx-3 mt-3 min-h-0 flex-1 overflow-hidden",
          settings.chamber ? "chamber-well" : "rounded-sm border border-ink/20",
        )}
      >
        {settings.chamber ? <WellFittings /> : null}
        <SketchCanvas
          ref={sketchRef}
          tool={tool}
          locked={busy || held || showingResult}
          className={cn(
            "absolute inset-0",
            (phase === "dissolving" || showingResult) && "dissolve-out",
            showingResult && "opacity-0",
          )}
          onChange={bump}
        />
        <SpellOverlay
          phase={phase}
          imageSrc={images[active] ?? images[0] ?? null}
          message={error}
        />
      </section>

      <div className="px-3 pt-2">
        <Echoes images={images} active={active} onSelect={setActive} />
      </div>

      <div className="px-4 pt-2">
        <label className="sr-only" htmlFor="incantation">
          Incantation
        </label>
        <input
          id="incantation"
          value={held ? transcript : transcript || draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setTranscript(e.target.value);
          }}
          placeholder={held ? "Listening…" : "The spell appears here — or write it"}
          className="h-10 w-full border-b border-ink/25 bg-transparent font-body text-base italic text-ink outline-none placeholder:text-dust"
          disabled={busy}
        />
        {error && phase !== "fizzled" ? (
          <p className={cn("mt-1 font-body text-sm italic", settings.chamber ? "text-brass-bright" : "text-ink")}>{error}</p>
        ) : owlNote ? (
          <p className={cn("mt-1 font-body text-sm italic", settings.chamber ? "text-brass-bright" : "text-ash")}>{owlNote}</p>
        ) : null}
      </div>

      <footer className="flex items-end justify-between gap-2 px-3 pb-[max(0.9rem,env(safe-area-inset-bottom))] pt-2">
        <div className="flex flex-col gap-2">
          <div className="flex gap-1">
            <IconBtn
              label="Quill"
              pressed={tool === "quill"}
              onClick={() => setTool("quill")}
            >
              <Feather className="size-5" strokeWidth={1.5} />
            </IconBtn>
            <IconBtn
              label="Rubber"
              pressed={tool === "rubber"}
              onClick={() => setTool("rubber")}
            >
              <Eraser className="size-5" strokeWidth={1.5} />
            </IconBtn>
          </div>
          <IconBtn label="New parchment" onClick={newParchment}>
            <FileText className="size-5" strokeWidth={1.5} />
          </IconBtn>
        </div>

        <Wand
          held={held}
          flicking={flicking}
          disabled={busy}
          label={wandLabel}
          onHoldStart={beginHold}
          onHoldEnd={endHold}
        />

        <div className="flex flex-col items-end gap-2">
          <IconBtn
            label="Another visage"
            onClick={() => void reroll()}
            disabled={!images.length || busy}
          >
            <RotateCcw className="size-5" strokeWidth={1.5} />
          </IconBtn>
          <OwlPost
            disabled={!images.length || busy}
            flying={owlFlying}
            onClick={() => void dispatchOwl()}
          />
          <button
            type="button"
            onClick={backToSketch}
            disabled={!showingResult || busy}
            className="h-10 px-2 font-display text-[0.62rem] uppercase tracking-[0.16em] text-ash disabled:opacity-30"
          >
            Sketch
          </button>
        </div>
      </footer>

      <Grimoire
        open={grimoire}
        settings={settings}
        onChange={setSettings}
        onClose={() => setGrimoire(false)}
      />

      <span className="sr-only">{tick}</span>
      </div>
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  children,
  pressed,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  pressed?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-11 items-center justify-center rounded-sm border border-ink/20 text-ink",
        "transition-transform duration-150 ease-out active:scale-[0.96]",
        "disabled:opacity-30",
        pressed && "bg-ink text-parchment",
      )}
    >
      {children}
    </button>
  );
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
