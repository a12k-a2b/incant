import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { hasInk, type Drawing, type Point, type Stroke } from "@/lib/drawing";
import { loadDurableDraft, saveDurableDraft } from "@/lib/durable-draft";
import { inkPoint, inkSamples } from "@/lib/ink-input";
import { setInkContact } from "@/lib/ink-activity";
export type Tool = "quill" | "rubber";
export type SketchCanvasHandle = {
  exportPng: () => string | null;
  commitCurrent: () => void;
  flush: () => Promise<void>;
  clear: () => void;
  undo: () => void;
  redo: () => void;
  isEmpty: () => boolean;
  isDrawing: () => boolean;
  canUndo: () => boolean;
  canRedo: () => boolean;
};
type Props = {
  tool: Tool;
  locked: boolean;
  className?: string;
  onVisualChange?: () => void;
  onChange?: () => void;
  onReady?: () => void;
  onStorageError?: (message: string) => void;
};
const PAPER = "#ffffff",
  INK = "#292820";
export const SketchCanvas = forwardRef<SketchCanvasHandle, Props>(
  function SketchCanvas(
    {
      tool,
      locked,
      className,
      onVisualChange,
      onChange,
      onReady,
      onStorageError,
    },
    ref,
  ) {
    const refit = useRef<() => void>(() => {});
    const dimensions = useRef({ w: 1024, h: 1536 });
    const canvas = useRef<HTMLCanvasElement>(null),
      strokes = useRef<Drawing>([]),
      future = useRef<Drawing>([]);
    const current = useRef<Stroke | null>(null),
      pointer = useRef<number | null>(null);
    const roundedStrokes = useRef(new WeakMap<Stroke, Stroke>());
    const hydrated = useRef(false),
      durableRevision = useRef(0),
      latestSave = useRef<Promise<void>>(Promise.resolve());
    const callbacks = useRef({
      onVisualChange,
      onChange,
      onReady,
      onStorageError,
    });
    callbacks.current = {
      onVisualChange,
      onChange,
      onReady,
      onStorageError,
    };
    const segment = (a: Point, b: Point, eraser: boolean) => {
      const ctx = canvas.current?.getContext("2d");
      if (!ctx) return;
      ctx.strokeStyle = ctx.fillStyle = eraser ? PAPER : INK;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = eraser ? 40 + (a.p + b.p) * 20 : 2 + (a.p + b.p) * 3;
      ctx.beginPath();
      ctx.moveTo(a.x * dimensions.current.w, a.y * dimensions.current.h);
      ctx.lineTo(b.x * dimensions.current.w, b.y * dimensions.current.h);
      ctx.stroke();
      if (a.x === b.x && a.y === b.y) {
        ctx.beginPath();
        ctx.arc(
          a.x * dimensions.current.w,
          a.y * dimensions.current.h,
          ctx.lineWidth / 2,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    };
    const paint = () => {
      const ctx = canvas.current?.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, dimensions.current.w, dimensions.current.h);
      for (const s of [
        ...strokes.current,
        ...(current.current ? [current.current] : []),
      ])
        s.points.forEach((p, i) =>
          segment(s.points[Math.max(0, i - 1)], p, s.eraser),
        );
    };
    const roundedDrawing = (): Drawing =>
      strokes.current.map((stroke) => {
        let rounded = roundedStrokes.current.get(stroke);
        if (!rounded) {
          rounded = {
            eraser: stroke.eraser,
            points: stroke.points.map(({ x, y, p }) => ({
              x: Math.round(x * 10_000) / 10_000,
              y: Math.round(y * 10_000) / 10_000,
              p: Math.round(p * 10_000) / 10_000,
            })),
          };
          roundedStrokes.current.set(stroke, rounded);
        }
        return rounded;
      });
    const changed = () => {
      callbacks.current.onVisualChange?.();
      const revision = ++durableRevision.current;
      const saving = saveDurableDraft({
        drawing: roundedDrawing(),
        size: { ...dimensions.current },
        revision,
      })
        .then(() => {
          if (revision === durableRevision.current)
            callbacks.current.onChange?.();
        })
        .catch(() => {
          if (revision === durableRevision.current)
            callbacks.current.onStorageError?.(
              "This browser could not save your draft. Download the sketch before leaving.",
            );
          throw new Error("The draft could not be saved.");
        });
      latestSave.current = saving;
      // Pointer event handlers cannot await persistence. flush() exposes the
      // same rejection to destructive actions such as a page turn.
      void saving.catch(() => {});
      return saving;
    };
    const commitCurrent = () => {
      if (!current.current) return;
      strokes.current.push(current.current);
      future.current = [];
      current.current = null;
      pointer.current = null;
      setInkContact(canvas, false);
      changed();
    };
    useEffect(() => {
      const node = canvas.current!;
      const host = node.parentElement!;
      let alive = true;
      let observer: ResizeObserver | null = null;
      let painted = false;
      const fit = () => {
        const r = host.getBoundingClientRect();
        if (!strokes.current.length && !current.current) {
          const ratio = Math.max(1 / 3, Math.min(3, r.width / r.height));
          dimensions.current =
            ratio > 1
              ? { w: 1536, h: Math.round(1536 / ratio / 16) * 16 }
              : { w: Math.round((1536 * ratio) / 16) * 16, h: 1536 };
        }
        const { w, h } = dimensions.current;
        const scale = Math.min(r.width / w, r.height / h);
        node.style.width = w * scale + "px";
        node.style.height = h * scale + "px";
        const bitmapChanged = node.width !== w || node.height !== h;
        if (bitmapChanged) {
          node.width = w;
          node.height = h;
        }
        // CSS-only resizes retain the bitmap. Replaying all ink here can stall
        // the pen when the keyboard/viewport changes or the observer repeats.
        if (bitmapChanged || !painted) paint();
        painted = true;
      };
      refit.current = fit;
      void loadDurableDraft()
        .then((saved) => {
          if (!alive) return;
          if (saved) {
            strokes.current = saved.drawing;
            dimensions.current = saved.size;
            durableRevision.current = saved.revision;
          }
        })
        .catch(() => {
          if (alive)
            callbacks.current.onStorageError?.(
              "This browser could not restore your saved draft. Start with a test mark before drawing more.",
            );
        })
        .finally(() => {
          if (!alive) return;
          fit();
          observer = new ResizeObserver(fit);
          observer.observe(host);
          hydrated.current = true;
          callbacks.current.onReady?.();
        });
      return () => {
        alive = false;
        observer?.disconnect();
      };
    }, []);
    useImperativeHandle(ref, () => ({
      exportPng: () => canvas.current?.toDataURL("image/png") ?? null,
      commitCurrent,
      flush: () => latestSave.current,
      clear: () => {
        future.current = [];
        strokes.current = [];
        refit.current();
        paint();
        changed();
      },
      undo: () => {
        const s = strokes.current.pop();
        if (s) future.current.push(s);
        paint();
        changed();
      },
      redo: () => {
        const s = future.current.pop();
        if (s) strokes.current.push(s);
        paint();
        changed();
      },
      isEmpty: () =>
        !hasInk([
          ...strokes.current,
          ...(current.current ? [current.current] : []),
        ]),
      canUndo: () => strokes.current.length > 0,
      canRedo: () => future.current.length > 0,
      isDrawing: () => current.current !== null,
    }));
    useEffect(() => {
      const node = canvas.current;
      if (!node) return;
      // A hovering barrel button is an active pointer, but is not pen contact.
      // Chorded tip contact may arrive as pointermove rather than pointerdown.
      let pendingPen: number | null = null;
      const penContact = (e: PointerEvent) => {
        if ((e.buttons & 32) !== 0 || e.button === 5) return 32;
        if ((e.buttons & 1) !== 0) return 1;
        if ((e.buttons & 2) !== 0 || e.button === 2) return 0;
        // Retain first-sample/legacy button-only contact compatibility.
        if (e.button === 0 && (e.type === "pointerdown" || e.pressure > 0))
          return 1;
        return 0;
      };
      const down = (e: PointerEvent) => {
        if (
          locked ||
          !hydrated.current ||
          pointer.current !== null ||
          !["pen", "mouse"].includes(e.pointerType) ||
          (e.pointerType === "mouse" && e.button !== 0)
        )
          return;
        if (e.pointerType === "pen" && !penContact(e)) {
          pendingPen = (e.buttons & 2) !== 0 ? e.pointerId : null;
          return;
        }
        pendingPen = null;
        if (strokes.current.length >= 2000) {
          callbacks.current.onStorageError?.(
            "This parchment is full. Save your sketch before starting another page.",
          );
          return;
        }
        e.preventDefault();
        node.setPointerCapture(e.pointerId);
        pointer.current = e.pointerId;
        current.current = {
          eraser: tool === "rubber" || e.button === 5 || (e.buttons & 32) !== 0,
          points: [inkPoint(e, node.getBoundingClientRect())],
        };
        setInkContact(canvas, true);
        segment(
          current.current.points[0],
          current.current.points[0],
          current.current.eraser,
        );
      };
      const move = (e: PointerEvent) => {
        if (e.pointerType === "pen") {
          const contact = penContact(e);
          if (e.pointerId === pointer.current && !contact) {
            finish(e); // Keep legitimate ink, but never append a hover sample.
            // If contact resumes before a terminal up/cancel, start a separate
            // segment instead of ignoring the rest of this pointer sequence.
            pendingPen = e.pointerId;
            return;
          }
          if (
            pointer.current === null &&
            pendingPen === e.pointerId &&
            contact
          ) {
            down(e);
            return;
          }
        }
        const s = current.current;
        if (e.pointerId !== pointer.current || !s) return;
        e.preventDefault();
        const bounds = node.getBoundingClientRect();
        for (const sample of inkSamples(e)) {
          if (s.points.length >= 20000) break;
          const next = inkPoint(sample, bounds);
          segment(s.points[s.points.length - 1], next, s.eraser);
          s.points.push(next);
        }
      };
      const finish = (e?: PointerEvent) => {
        if (!e || e.pointerId === pendingPen) pendingPen = null;
        if (!current.current || (e && e.pointerId !== pointer.current)) return;
        // A fast flick can end beyond the last pointermove. Up is a real
        // endpoint; cancel, capture loss and hover are not geometry samples.
        const stroke = current.current;
        if (e?.type === "pointerup" && stroke.points.length < 20000) {
          const last = stroke.points[stroke.points.length - 1];
          const next = inkPoint(e, node.getBoundingClientRect());
          next.p = last.p; // release pressure is zero, not a new brush width
          if (next.x !== last.x || next.y !== last.y) {
            segment(last, next, stroke.eraser);
            stroke.points.push(next);
          }
        }
        commitCurrent();
      };
      const interrupted = () => finish();
      const visibility = () => {
        if (document.hidden) finish();
      };
      node.addEventListener("pointerdown", down);
      node.addEventListener("pointermove", move);
      node.addEventListener("pointerup", finish);
      node.addEventListener("pointercancel", finish);
      node.addEventListener("lostpointercapture", finish);
      window.addEventListener("blur", interrupted);
      window.addEventListener("pagehide", interrupted);
      document.addEventListener("visibilitychange", visibility);
      return () => {
        finish();
        node.removeEventListener("pointerdown", down);
        node.removeEventListener("pointermove", move);
        node.removeEventListener("pointerup", finish);
        node.removeEventListener("pointercancel", finish);
        node.removeEventListener("lostpointercapture", finish);
        window.removeEventListener("blur", interrupted);
        window.removeEventListener("pagehide", interrupted);
        document.removeEventListener("visibilitychange", visibility);
      };
    }, [tool, locked]);
    return (
      <canvas
        ref={canvas}
        width={1024}
        height={1536}
        className={className}
        style={{ touchAction: "none" }}
        aria-label="Drawing parchment. Use your stylus or mouse; fingers are ignored."
      />
    );
  },
);
