import { useEffect, useRef, useState } from "react";
export const TOUR_KEY = "incant-introduction-v1";
export function needsIntroduction() {
  if (new URLSearchParams(window.location.search).get("view") === "spellbook")
    return true;
  try {
    return localStorage.getItem(TOUR_KEY) !== "seen";
  } catch {
    return true;
  }
}
const steps = [
  {
    title: "Begin with a scribble.",
    copy: "Draw your idea on the parchment with your pen. A few lines are enough.",
    hint: "Your sketch decides what goes where.",
  },
  {
    title: "Give your drawing a spell.",
    copy: "Hold the wand. When it says Listening, describe your idea. Lift to cast.",
    hint: "Or tap to start talking, then tap again to cast.",
  },
  {
    title: "Quiet magic works too.",
    copy: "Tap the little typewriter to write your spell instead. Then tap its sparkle to cast.",
    hint: "Your sketch + your words → an image.",
  },
  {
    title: "There is always another story.",
    copy: "Tap the moon for fresh parchment. Tap the books to revisit, save, or share your creations.",
    hint: "The owl shares your magic. The dragon keeps settings, undo, and a way back to your drawing.",
  },
];
const targets = [
  [".paper"],
  [".wand-rest"],
  [".typewriter-key"],
  [".moon-key", ".spellbooks-key", ".owl-key", ".dragon-key"],
];
type Highlight = {
  target: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
export function Onboarding({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0),
    dialog = useRef<HTMLDialogElement>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  useEffect(() => {
    const measure = () =>
      setHighlights(
        targets[step].flatMap((target) => {
          const element = document.querySelector(target);
          if (!element) return [];
          const r = element.getBoundingClientRect();
          if (!r.width || !r.height) return [];
          const x = Math.max(4, r.left - 5),
            y = Math.max(4, r.top - 5);
          return [
            {
              target,
              x,
              y,
              width: Math.max(0, Math.min(innerWidth - 4, r.right + 5) - x),
              height: Math.max(0, Math.min(innerHeight - 4, r.bottom + 5) - y),
            },
          ];
        }),
      );
    measure();
    const observer = new ResizeObserver(measure);
    for (const target of targets[step]) {
      const element = document.querySelector(target);
      if (element) observer.observe(element);
    }
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [step]);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement;
    dialog.current?.showModal();
    return () => {
      dialog.current?.close();
      if (previousFocus.current?.isConnected)
        previousFocus.current.focus({ preventScroll: true });
    };
  }, []);
  const finish = () => {
    try {
      localStorage.setItem(TOUR_KEY, "seen");
    } catch {}
    onClose();
  };
  return (
    <dialog
      ref={dialog}
      className="incant-introduction"
      aria-label="A little guide to Sketch Magic"
      onCancel={(e) => {
        e.preventDefault();
        finish();
      }}
    >
      <svg className="introduction-spotlights" aria-hidden="true">
        <defs>
          <mask id="incant-tour-shade">
            <rect width="100%" height="100%" fill="white" />
            {highlights.map((h) => (
              <rect
                key={h.target}
                x={h.x}
                y={h.y}
                width={h.width}
                height={h.height}
                rx="18"
                fill="black"
              />
            ))}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="#241d16"
          fillOpacity=".42"
          mask="url(#incant-tour-shade)"
        />
        {highlights.map((h) => (
          <rect
            className="introduction-glow"
            data-tour-target={h.target}
            key={h.target}
            x={h.x}
            y={h.y}
            width={h.width}
            height={h.height}
            rx="18"
          />
        ))}
      </svg>
      <div className="introduction-card">
        <div className="introduction-top">
          <span aria-label={`Step ${step + 1} of ${steps.length}`}>
            {step + 1} <span aria-hidden="true">✦</span> {steps.length}
          </span>
          <button onClick={finish}>Skip</button>
        </div>
        <div className="introduction-page" key={step}>
          <TourDrawing step={step} />
          <div aria-live="polite" aria-atomic="true">
            <h2>{steps[step].title}</h2>
            <p>{steps[step].copy}</p>
            <p className="introduction-hint">{steps[step].hint}</p>
          </div>
        </div>
        <footer>
          {step > 0 ? (
            <button onClick={() => setStep(step - 1)}>Back</button>
          ) : (
            <span />
          )}
          <button
            className="introduction-next"
            onClick={() =>
              step === steps.length - 1 ? finish() : setStep(step + 1)
            }
          >
            {step === steps.length - 1 ? "Let’s make magic" : "Next"}{" "}
            <span aria-hidden="true">✧</span>
          </button>
        </footer>
      </div>
    </dialog>
  );
}
function TourDrawing({ step }: { step: number }) {
  if (step === 2)
    return (
      <div
        className="introduction-picture typewriter-lesson"
        aria-hidden="true"
      >
        <img src="/wizard-typewriter.png" alt="" />
        <span>Once upon a spell…</span>
      </div>
    );
  return (
    <svg
      className={`introduction-picture lesson-${step}`}
      viewBox="0 0 320 160"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path
        className="lesson-paper"
        d="M53 137l3-112 10 3 12-5 10 4 16-3 15 3 13-4 15 3 12-3 16 4 14-4 12 4 17-3 12 3 15-3 18 3-3 112-16-3-13 3-16-3-14 3-15-2-15 3-13-3-17 2-14-2-13 3-16-3-12 2z"
        fill="#faf3df"
        stroke="#a99775"
      />
      {step === 0 && (
        <>
          <path
            className="lesson-ink"
            pathLength="1"
            d="M88 116h143M112 115V83l39-35 40 34v32M104 86l47-43 48 43M145 115V92h18v23M124 86h10v12h-10zM177 87h9v10h-9z"
          />
          <g className="lesson-pen">
            <path d="m216 55 39-33 5 6-39 33-12 4z" fill="#ad9167" />
            <path d="m216 55 5 6" />
          </g>
        </>
      )}
      {step === 1 && (
        <>
          <g className="lesson-result">
            <path d="M100 114V79l45-36 43 36v35M91 80l54-44 52 44M136 114V89h20v25M111 81h13v16h-13zM166 81h11v16h-11z" />
            <path d="M89 117h118M197 117V84m0 4-12-7m12 17 15-11M86 110c-10-7-8-15 1-21-5-12 1-18 7-20" />
            <path d="M146 52v14m-15-6h29M108 105h21m34 0h20" strokeWidth="1" />
          </g>
          <g className="lesson-wand">
            <path d="m212 137 59-41" stroke="#59432b" strokeWidth="7" />
            <path d="m212 137 59-41" stroke="#b49969" strokeWidth="2" />
          </g>
          <g className="lesson-sparks">
            <path d="m245 77-8-12m-3 22-14-3m36-15 2-15M211 66l4 7 8 1-6 5 1 8-7-4-7 4 1-8-6-5 8-1z" />
          </g>
        </>
      )}
      {step === 3 && (
        <>
          <g className="lesson-moon">
            <path
              d="M142 44a31 31 0 1 0 32 49 31 31 0 0 1-32-49z"
              fill="#c7b28c"
            />
            <path d="m186 44 2 7 7 2-7 2-2 7-2-7-7-2 7-2z" />
          </g>
          <g transform="rotate(-8 226 109)">
            <path
              d="M192 96h62v15h-62q-8-7 0-15zM191 114h57v14h-57q-8-7 0-14zM195 81h54v13h-54q-8-7 0-13z"
              fill="#c5b38e"
            />
            <path d="M197 85h44m-45 17h50m-50 17h44" strokeWidth="1" />
          </g>
        </>
      )}
      <path
        d="m31 69 2 6 6 2-6 2-2 6-2-6-6-2 6-2zM282 46v8m-4-4h8"
        stroke="#9a815c"
      />
    </svg>
  );
}
