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
const W = 1024,
  H = 1536,
  PAPER = "#f7f3e8",
  INK = "#292820";
export const SketchCanvas = forwardRef<SketchCanvasHandle, Props>(
  function SketchCanvas(
    { tool, locked, className, onChange, onStorageError },
    ref,
  ) {
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
      ctx.moveTo(a.x * W, a.y * H);
      ctx.lineTo(b.x * W, b.y * H);
      ctx.stroke();
      if (a.x === b.x && a.y === b.y) {
        ctx.beginPath();
        ctx.arc(a.x * W, a.y * H, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    const paint = () => {
      const ctx = canvas.current?.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, W, H);
      for (const s of strokes.current)
        s.points.forEach((p, i) =>
          segment(s.points[Math.max(0, i - 1)], p, s.eraser),
        );
    };
    const changed = () => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(strokes.current));
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
      paint();
      callbacks.current.onChange?.();
    }, []);
    useImperativeHandle(ref, () => ({
      exportPng: () => canvas.current?.toDataURL("image/png") ?? null,
      clear: () => {
        future.current = [];
        strokes.current = [];
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
        width={W}
        height={H}
        className={className}
        style={{ touchAction: "none" }}
        aria-label="Drawing parchment. Use your stylus or mouse; fingers are ignored."
      />
    );
  },
);
