import { cn } from "@/lib/utils";

export type SpellPhase =
  | "idle"
  | "incanting"
  | "flicking"
  | "dissolving"
  | "gathering"
  | "manifesting"
  | "manifested"
  | "fizzled";

type Props = {
  phase: SpellPhase;
  imageSrc?: string | null;
  message?: string;
};

export function SpellOverlay({ phase, imageSrc, message }: Props) {
  const showFog =
    phase === "flicking" ||
    phase === "dissolving" ||
    phase === "gathering" ||
    phase === "manifesting";
  const showBolt = phase === "flicking";
  const showImage =
    (phase === "manifesting" || phase === "manifested") && imageSrc;
  const hideSketch =
    phase === "dissolving" ||
    phase === "gathering" ||
    phase === "manifesting" ||
    phase === "manifested";

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        hideSketch && phase !== "manifested" ? "bg-parchment/40" : "",
      )}
      aria-hidden={phase === "idle"}
    >
      {showBolt ? (
        <div className="absolute inset-x-0 bottom-0 top-1/2 flex justify-center">
          <svg viewBox="0 0 24 180" className="bolt-travel h-full w-8 text-ink">
            <path
              d="M12 180 C10 140, 16 110, 11 80 C7 50, 18 28, 12 0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
            <circle cx="12" cy="8" r="3.2" fill="currentColor" />
          </svg>
        </div>
      ) : null}

      {showFog ? (
        <div className="fog-veil absolute inset-0">
          <svg className="h-full w-full" aria-hidden>
            <filter id="incant-fog">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.72"
                numOctaves="2"
                seed="4"
              />
              <feColorMatrix
                type="matrix"
                values="0 0 0 0 0.12  0 0 0 0 0.11  0 0 0 0 0.09  0 0 0 0.55 0"
              />
            </filter>
            <rect width="100%" height="100%" filter="url(#incant-fog)" />
          </svg>
        </div>
      ) : null}

      {phase === "gathering" ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="gather-runes flex flex-col items-center gap-3 text-ink">
            <svg viewBox="0 0 80 80" className="h-20 w-20" fill="none">
              <circle
                cx="40"
                cy="40"
                r="28"
                stroke="currentColor"
                strokeWidth="0.8"
              />
              <circle
                cx="40"
                cy="40"
                r="16"
                stroke="currentColor"
                strokeWidth="0.6"
              />
              <path
                d="M40 8 L40 72 M8 40 L72 40 M18 18 L62 62 M62 18 L18 62"
                stroke="currentColor"
                strokeWidth="0.5"
                opacity="0.7"
              />
            </svg>
            <p className="font-display text-[0.7rem] uppercase tracking-[0.22em]">
              The spell gathers
            </p>
          </div>
        </div>
      ) : null}

      {showImage ? (
        <img
          src={imageSrc ?? ""}
          alt=""
          className={cn(
            "absolute inset-0 h-full w-full object-cover",
            phase === "manifesting" ? "manifest-in" : "",
          )}
        />
      ) : null}

      {phase === "fizzled" && message ? (
        <div className="absolute inset-0 flex items-center justify-center bg-parchment/80 p-8">
          <p className="max-w-sm text-center font-body text-lg italic text-ink">
            {message}
          </p>
        </div>
      ) : null}
    </div>
  );
}
