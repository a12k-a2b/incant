import type { PointerEvent } from "react";
import { cn } from "@/lib/utils";

type Props = {
  held: boolean;
  flicking: boolean;
  disabled?: boolean;
  label: string;
  onHoldStart: (e: PointerEvent<HTMLButtonElement>) => void;
  onHoldEnd: (e: PointerEvent<HTMLButtonElement>) => void;
};

export function Wand({
  held,
  flicking,
  disabled,
  label,
  onHoldStart,
  onHoldEnd,
}: Props) {
  return (
    <div className="wand-socket relative flex flex-col items-center">
      <p className="mb-2 font-display text-[0.68rem] uppercase tracking-[0.22em] text-ash">
        {label}
      </p>
      <button
        type="button"
        disabled={disabled}
        aria-label="Hold to speak your spell"
        onPointerDown={onHoldStart}
        onPointerUp={onHoldEnd}
        onPointerCancel={onHoldEnd}
        onContextMenu={(e) => e.preventDefault()}
        className={cn(
          "wand-press relative flex h-28 w-28 items-center justify-center rounded-full",
          "border border-ink/35 bg-parchment-deep shadow-[inset_0_0_0_1px_rgba(26,24,20,0.08)]",
          "transition-transform duration-150 ease-out",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
          "disabled:opacity-40",
          held && "pulse-hold",
        )}
        style={{ touchAction: "none" }}
      >
        <svg
          viewBox="0 0 96 96"
          className={cn(
            "pointer-events-none absolute inset-2 text-ink",
            "rune-ring",
            held && "is-held",
          )}
          fill="none"
          aria-hidden
        >
          <circle
            cx="48"
            cy="48"
            r="42"
            stroke="currentColor"
            strokeWidth="0.7"
            strokeDasharray="3 5"
            opacity="0.55"
          />
          <circle
            cx="48"
            cy="48"
            r="36"
            stroke="currentColor"
            strokeWidth="0.4"
            opacity="0.35"
          />
        </svg>

        <svg
          viewBox="0 0 64 140"
          className={cn(
            "pointer-events-none relative h-[5.6rem] w-11 origin-bottom text-ink",
            held && "wand-shaft is-held",
            flicking && "wand-flick",
          )}
          fill="none"
          aria-hidden
        >
          <path
            d="M32 8 L34.2 96 L29.8 96 Z"
            fill="currentColor"
            opacity="0.92"
          />
          <path
            d="M32 8 L33.1 96"
            stroke="currentColor"
            strokeWidth="0.4"
            opacity="0.4"
          />
          <rect
            x="27.2"
            y="94"
            width="9.6"
            height="28"
            rx="2.4"
            fill="currentColor"
          />
          <path
            d="M27.2 102 H36.8 M27.2 108 H36.8 M27.2 114 H36.8"
            stroke="var(--color-parchment)"
            strokeWidth="0.7"
            opacity="0.7"
          />
          <circle cx="32" cy="126" r="6.4" fill="currentColor" />
          <circle
            cx="32"
            cy="126"
            r="3.2"
            fill="var(--color-parchment)"
            opacity="0.85"
          />
          <path
            d="M32 6 L33.5 12 L32 11 L30.5 12 Z"
            fill="currentColor"
          />
        </svg>

        {held ? (
          <span className="pointer-events-none absolute -bottom-1 font-display text-[0.62rem] uppercase tracking-[0.2em] text-ink">
            Listening
          </span>
        ) : null}
      </button>
    </div>
  );
}
