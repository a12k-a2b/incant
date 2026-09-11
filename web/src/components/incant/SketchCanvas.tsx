import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  DRAFT_KEY,
  hasInk,
  validDrawing,
  type Drawing,
  type Point,
  type Stroke,
} from "@/lib/drawing";
export type Tool = "quill" | "rubber";
export type SketchCanvasHandle = {
  exportPng: () => string | null;
  clear: () => void;
  undo: () => void;
  redo: () => void;
  isEmpty: () => boolean;
  canUndo: () => boolean;
  canRedo: () => boolean;
};
type Props = {
  tool: Tool;
  locked: boolean;
  className?: string;
  onChange?: () => void;
  onStorageError?: (message: string) => void;
};
const PAPER = "#ffffff",
  INK = "#292820";
export const SketchCanvas = forwardRef<SketchCanvasHandle, Props>(
  function SketchCanvas(
    { tool, locked, className, onChange, onStorageError },
    ref,
  ) {
    const refit = useRef<() => void>(() => {});
    const dimensions = useRef({ w: 1024, h: 1536 });
    const canvas = useRef<HTMLCanvasElement>(null),
      strokes = useRef<Drawing>([]),
      future = useRef<Drawing>([]);
    const current = useRef<Stroke | null>(null),
      pointer = useRef<number | null>(null);
    const callbacks = useRef({ onChange, onStorageError });
    callbacks.current = { onChange, onStorageError };
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
    const changed = () => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(strokes.current));
        localStorage.setItem(
          DRAFT_KEY + "-size",
          JSON.stringify(dimensions.current),
        );
      } catch {
        callbacks.current.onStorageError?.(
          "This browser could not save your draft. Download the sketch before leaving.",
        );
      }
      callbacks.current.onChange?.();
    };
    useEffect(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || "[]");
        if (validDrawing(saved)) strokes.current = saved;
      } catch {
        /* keep blank page */
      }
      const node = canvas.current!;
      const host = node.parentElement!;
      try {
        const d = JSON.parse(
          localStorage.getItem(DRAFT_KEY + "-size") || "null",
        );
        if (
          d &&
          [d.w, d.h].every(
            (v) => Number.isInteger(v) && v >= 512 && v <= 1536 && v % 16 === 0,
          )
        )
          dimensions.current = d;
      } catch {
        /* older drafts keep their original aspect */
      }
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
        if (node.width !== w || node.height !== h) {
          node.width = w;
          node.height = h;
        }
        paint();
      };
      refit.current = fit;
      fit();
      const observer = new ResizeObserver(fit);
      observer.observe(host);
      callbacks.current.onChange?.();
      return () => observer.disconnect();
    }, []);
    useImperativeHandle(ref, () => ({
      exportPng: () => canvas.current?.toDataURL("image/png") ?? null,
      clear: () => {
        future.current = [];
        strokes.current = [];
        refit.current();
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
      isEmpty: () => !hasInk(strokes.current),
      canUndo: () => strokes.current.length > 0,
      canRedo: () => future.current.length > 0,
    }));
    useEffect(() => {
      const node = canvas.current;
      if (!node) return;
      const point = (e: PointerEvent): Point => {
        const r = node.getBoundingClientRect();
        return {
          x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
          y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
          p: e.pressure || 0.45,
        };
      };
      const down = (e: PointerEvent) => {
        if (
          locked ||
          pointer.current !== null ||
          !["pen", "mouse"].includes(e.pointerType) ||
          (e.pointerType === "mouse" && e.button !== 0)
        )
          return;
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
          points: [point(e)],
        };
        segment(
          current.current.points[0],
          current.current.points[0],
          current.current.eraser,
        );
      };
      const move = (e: PointerEvent) => {
        const s = current.current;
        if (e.pointerId !== pointer.current || !s) return;
        e.preventDefault();
        for (const sample of e.getCoalescedEvents?.().length
          ? e.getCoalescedEvents()
          : [e]) {
          if (s.points.length >= 20000) break;
          const next = point(sample);
          segment(s.points[s.points.length - 1], next, s.eraser);
          s.points.push(next);
        }
      };
      const finish = (e?: PointerEvent) => {
        if (!current.current || (e && e.pointerId !== pointer.current)) return;
        strokes.current.push(current.current);
        future.current = [];
        current.current = null;
        pointer.current = null;
        changed();
      };
      node.addEventListener("pointerdown", down);
      node.addEventListener("pointermove", move);
      node.addEventListener("pointerup", finish);
      node.addEventListener("pointercancel", finish);
      node.addEventListener("lostpointercapture", finish);
      return () => {
        finish();
        node.removeEventListener("pointerdown", down);
        node.removeEventListener("pointermove", move);
        node.removeEventListener("pointerup", finish);
        node.removeEventListener("pointercancel", finish);
        node.removeEventListener("lostpointercapture", finish);
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
