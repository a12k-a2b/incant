import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

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

type Point = { x: number; y: number; p: number };

type Props = {
  tool: Tool;
  locked: boolean;
  className?: string;
  onChange?: () => void;
};

function isDrawPointer(e: PointerEvent) {
  if (e.pointerType === "touch") return false;
  return e.pointerType === "pen" || e.pointerType === "mouse";
}

function isEraserEvent(e: PointerEvent, tool: Tool) {
  if (tool === "rubber") return true;
  if (e.button === 5) return true;
  if ((e.buttons & 32) === 32) return true;
  return false;
}

export const SketchCanvas = forwardRef<SketchCanvasHandle, Props>(
  function SketchCanvas({ tool, locked, className, onChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const overlayRef = useRef<HTMLCanvasElement | null>(null);
    const strokes = useRef<ImageData[]>([]);
    const future = useRef<ImageData[]>([]);
    const drawing = useRef(false);
    const last = useRef<Point | null>(null);
    const empty = useRef(true);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const sizeCanvas = () => {
      const canvas = canvasRef.current;
      const overlay = overlayRef.current;
      if (!canvas || !overlay) return;
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const nextW = Math.max(1, Math.floor(rect.width * dpr));
      const nextH = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width === nextW && canvas.height === nextH) return;

      const keep = canvas.width > 0 && canvas.height > 0 ? canvas.toDataURL() : null;

      for (const node of [canvas, overlay]) {
        node.width = nextW;
        node.height = nextH;
        node.style.width = `${rect.width}px`;
        node.style.height = `${rect.height}px`;
        const ctx = node.getContext("2d");
        if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      fillPaper(canvas);

      if (keep) {
        const img = new Image();
        img.onload = () => {
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          ctx.drawImage(img, 0, 0, rect.width, rect.height);
          snapshot();
        };
        img.src = keep;
      } else {
        strokes.current = [];
        future.current = [];
        snapshot();
      }
    };

    const fillPaper = (canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const { width, height } = canvas.getBoundingClientRect();
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#f3efe4";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      ctx.fillStyle = "#f3efe4";
      ctx.fillRect(0, 0, width, height);
    };

    const snapshot = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      strokes.current.push(data);
      if (strokes.current.length > 28) strokes.current.shift();
      future.current = [];
    };

    const restore = (data: ImageData) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      ctx.putImageData(data, 0, 0);
    };

    useImperativeHandle(ref, () => ({
      exportPng: () => canvasRef.current?.toDataURL("image/png") ?? null,
      clear: () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        fillPaper(canvas);
        empty.current = true;
        snapshot();
        onChangeRef.current?.();
      },
      undo: () => {
        if (strokes.current.length < 2) return;
        const current = strokes.current.pop();
        if (current) future.current.push(current);
        const prev = strokes.current[strokes.current.length - 1];
        if (prev) restore(prev);
        onChangeRef.current?.();
      },
      redo: () => {
        const next = future.current.pop();
        if (!next) return;
        restore(next);
        strokes.current.push(next);
        onChangeRef.current?.();
      },
      isEmpty: () => empty.current,
      canUndo: () => strokes.current.length > 1,
      canRedo: () => future.current.length > 0,
    }));

    useEffect(() => {
      sizeCanvas();
      const parent = canvasRef.current?.parentElement;
      if (!parent) return;
      const observer = new ResizeObserver(() => {
        sizeCanvas();
        onChangeRef.current?.();
      });
      observer.observe(parent);
      return () => observer.disconnect();
    }, []);

    useEffect(() => {
      const canvas = overlayRef.current;
      const ink = canvasRef.current;
      if (!canvas || !ink) return;

      const pointFrom = (e: PointerEvent): Point => {
        const rect = canvas.getBoundingClientRect();
        return {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          p: e.pressure > 0 ? e.pressure : 0.45,
        };
      };

      const strokeWidth = (p: number, eraser: boolean) => {
        if (eraser) return 14 + p * 28;
        return 1.15 + p * 5.4;
      };

      const drawSegment = (
        ctx: CanvasRenderingContext2D,
        a: Point,
        b: Point,
        eraser: boolean,
      ) => {
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = eraser ? "#f3efe4" : "#1a1814";
        ctx.globalCompositeOperation = "source-over";
        ctx.lineWidth = strokeWidth((a.p + b.p) / 2, eraser);
        ctx.beginPath();
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(a.x, a.y, mx, my);
        ctx.stroke();
      };

      const onDown = (e: PointerEvent) => {
        if (locked) return;
        if (!isDrawPointer(e)) return;
        e.preventDefault();
        canvas.setPointerCapture(e.pointerId);
        drawing.current = true;
        last.current = pointFrom(e);
        empty.current = false;
      };

      const onMove = (e: PointerEvent) => {
        if (!drawing.current || !last.current) return;
        if (!isDrawPointer(e)) return;
        e.preventDefault();
        const next = pointFrom(e);
        const inkCtx = ink.getContext("2d");
        if (!inkCtx) return;
        drawSegment(inkCtx, last.current, next, isEraserEvent(e, tool));
        last.current = next;
      };

      const onUp = (e: PointerEvent) => {
        if (!drawing.current) return;
        drawing.current = false;
        last.current = null;
        try {
          canvas.releasePointerCapture(e.pointerId);
        } catch {
          /* already released */
        }
        snapshot();
        onChangeRef.current?.();
      };

      canvas.addEventListener("pointerdown", onDown);
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerup", onUp);
      canvas.addEventListener("pointercancel", onUp);
      canvas.addEventListener("lostpointercapture", onUp);

      return () => {
        canvas.removeEventListener("pointerdown", onDown);
        canvas.removeEventListener("pointermove", onMove);
        canvas.removeEventListener("pointerup", onUp);
        canvas.removeEventListener("pointercancel", onUp);
        canvas.removeEventListener("lostpointercapture", onUp);
      };
    }, [tool, locked]);

    return (
      <div className={className}>
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          aria-hidden
        />
        <canvas
          ref={overlayRef}
          className="absolute inset-0 h-full w-full touch-none"
          style={{ touchAction: "none" }}
        />
      </div>
    );
  },
);
