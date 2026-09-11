export function ChamberShell() {
  return (
    <div className="chamber-shell" aria-hidden>
      <div className="chamber-wood" />
      <div className="chamber-spine" />
      <div className="chamber-sconce chamber-sconce-left">
        <span className="chamber-cup" />
        <span className="chamber-flame" />
      </div>
      <div className="chamber-sconce chamber-sconce-right">
        <span className="chamber-cup" />
        <span className="chamber-flame" />
      </div>
      <svg className="chamber-crest" viewBox="0 0 64 64" fill="none">
        <circle
          cx="32"
          cy="32"
          r="28"
          stroke="currentColor"
          strokeWidth="1.4"
          opacity="0.7"
        />
        <path
          d="M32 10 L36 22 H48 L38 30 L42 42 L32 34 L22 42 L26 30 L16 22 H28 Z"
          fill="currentColor"
          opacity="0.55"
        />
      </svg>
    </div>
  );
}

export function WellFittings() {
  return (
    <div className="well-fittings pointer-events-none" aria-hidden>
      <span className="well-corner well-tl" />
      <span className="well-corner well-tr" />
      <span className="well-corner well-bl" />
      <span className="well-corner well-br" />
      <span className="well-rivet well-r1" />
      <span className="well-rivet well-r2" />
      <span className="well-rivet well-r3" />
      <span className="well-rivet well-r4" />
    </div>
  );
}
