import { useRef, useState } from "react";
import { createPortal } from "react-dom";
export function SketchPeel({
  source,
  controlHost,
}: {
  source: string;
  controlHost: HTMLElement | null;
}) {
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
      {controlHost &&
        createPortal(
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
                    Math.min(
                      200,
                      d.start + 100 * (dx / d.width + dy / d.height),
                    ),
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
            <svg viewBox="0 0 100 120" aria-hidden="true" fill="none">
              <path
                d="M18 11l14 2 13-3 17 3 18-2-3 13 5 20-4 19 4 19-6 20-17 4-18-3-22 3 4-22-5-20 4-23z"
                fill="#c9b58e"
                stroke="#493924"
                strokeWidth="2"
              />
              <path
                d="M22 17l9 2m18-3 15 2m10 5-2 12M22 92l-1 8 17-2m28 2 7-3 3-12"
                stroke="#796447"
              />
              <path
                d="M30 34q12-8 28-3M29 38l8-1M61 87l9-2M28 91l12 2"
                stroke="#998361"
                strokeWidth="1"
              />
              <g
                stroke="#4d3c28"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M50 46c-10-1-10-14-1-15 10-2 12 13 1 15zM50 46l-1 25-12 16m12-16 12 15M49 53l-16 10m16-10 15 8" />
                <path d="M24 88l7 2m36 0 6-2" strokeWidth="1" />
              </g>
              <path
                d="M18 106q26 7 58-4"
                stroke="#34271b"
                opacity=".45"
                strokeWidth="3"
              />
            </svg>
          </button>,
          controlHost,
        )}
    </>
  );
}
