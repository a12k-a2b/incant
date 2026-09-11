import { useRef, useState } from "react";
export function SketchPeel({ source }: { source: string }) {
  const [amount, setAmount] = useState(0);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    width: number;
    height: number;
    start: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  return (
    <>
      <img
        className="comparison-sketch"
        src={source}
        alt="Original sketch for comparison"
        draggable={false}
        style={{
          clipPath: `polygon(100% 100%,100% ${100 - amount}%,${100 - amount}% 100%)`,
        }}
      />
      <button
        className="parchment-peel"
        aria-label="Compare original sketch"
        aria-pressed={amount > 0}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (e.button !== 0 || drag.current) return;
          e.preventDefault();
          const r = e.currentTarget.parentElement!.getBoundingClientRect();
          drag.current = {
            id: e.pointerId,
            x: e.clientX,
            y: e.clientY,
            width: r.width,
            height: r.height,
            start: amount,
            moved: false,
          };
          suppressClick.current = false;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          const dx = d.x - e.clientX,
            dy = d.y - e.clientY;
          if (Math.hypot(dx, dy) > 6) d.moved = true;
          if (d.moved)
            setAmount(
              Math.max(
                0,
                Math.min(200, d.start + 100 * (dx / d.width + dy / d.height)),
              ),
            );
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          suppressClick.current = d.moved;
          drag.current = null;
          if (!d.moved) {
            setAmount((v) => (v > 0 ? 0 : 200));
            suppressClick.current = true;
          }
        }}
        onPointerCancel={() => {
          setAmount(drag.current?.start || 0);
          drag.current = null;
          suppressClick.current = false;
        }}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          setAmount((v) => (v > 0 ? 0 : 200));
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setAmount(0);
          if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
            e.preventDefault();
            setAmount((v) => Math.min(200, v + 20));
          }
          if (e.key === "ArrowRight" || e.key === "ArrowDown") {
            e.preventDefault();
            setAmount((v) => Math.max(0, v - 20));
          }
        }}
      >
        <span aria-hidden="true" />
      </button>
    </>
  );
}
