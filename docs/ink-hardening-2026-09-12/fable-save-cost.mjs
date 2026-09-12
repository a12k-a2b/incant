// Synthetic check: main-thread cost of one SketchCanvas.changed() -> saveDurableDraft()
// as the drawing grows. Mirrors the exact per-commit steps in the frozen source:
//   roundedDrawing()  (SketchCanvas.tsx:98-106)
//   validDraft(draft) (durable-draft.ts:99 -> drawing.ts:5-28)
//   structuredClone   (IDB store.put clone, durable-draft.ts:113, plus get() of the OLD full draft :108 + validDraft(old) :110)
//   JSON.stringify x2 (mirror(), durable-draft.ts:89-92; the -size key is trivial)
// No browser, no storage, no network. Numbers are relative; the DC-1 is slower than this host.
import { performance } from "node:perf_hooks";

function validDrawing(value) {
  return (
    Array.isArray(value) &&
    value.length <= 2000 &&
    value.every(
      (s) =>
        s &&
        typeof s.eraser === "boolean" &&
        Array.isArray(s.points) &&
        s.points.length <= 20000 &&
        s.points.every(
          (p) =>
            p &&
            [p.x, p.y, p.p].every(Number.isFinite) &&
            p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1 && p.p >= 0 && p.p <= 1,
        ),
    )
  );
}
const rounded = (strokes) =>
  strokes.map((stroke) => ({
    eraser: stroke.eraser,
    points: stroke.points.map(({ x, y, p }) => ({
      x: Math.round(x * 10_000) / 10_000,
      y: Math.round(y * 10_000) / 10_000,
      p: Math.round(p * 10_000) / 10_000,
    })),
  }));

function makeDrawing(strokes, pointsPerStroke) {
  const out = [];
  for (let s = 0; s < strokes; s++) {
    const points = [];
    for (let i = 0; i < pointsPerStroke; i++)
      points.push({ x: Math.random(), y: Math.random(), p: 0.3 + Math.random() * 0.5 });
    out.push({ eraser: s % 7 === 0, points });
  }
  return out;
}

const ms = (f) => { const t = performance.now(); const r = f(); return [performance.now() - t, r]; };

console.log("strokes  pts/stroke  totalPts   round  validate  clone(old+new)  stringify(env+drawing)  JSON KB  TOTAL/commit");
for (const [strokes, pps] of [[50, 120], [200, 150], [500, 200], [1000, 240], [2000, 300]]) {
  const drawing = makeDrawing(strokes, pps);
  const [tRound, draft] = ms(() => ({ drawing: rounded(drawing), size: { w: 1536, h: 1024 }, revision: strokes }));
  const [tValid] = ms(() => validDrawing(draft.drawing));
  const [tClone] = ms(() => { const old = structuredClone(draft); validDrawing(old.drawing); structuredClone(draft); });
  const [tJson, kb] = ms(() => (JSON.stringify(draft).length + JSON.stringify(draft.drawing).length) / 1024);
  const total = tRound + tValid + tClone + tJson;
  console.log(
    String(strokes).padStart(7), String(pps).padStart(11), String(strokes * pps).padStart(9),
    tRound.toFixed(1).padStart(7), tValid.toFixed(1).padStart(9), tClone.toFixed(1).padStart(15),
    tJson.toFixed(1).padStart(23), kb.toFixed(0).padStart(8), (total.toFixed(1) + " ms").padStart(13),
  );
}

// Terminal-sample check: pointerup position is never appended (SketchCanvas.tsx:308-312).
// Simulate the handler's data path with a move stream then an up at a different point.
const stroke = { eraser: false, points: [] };
const moves = [[0.10, 0.10], [0.20, 0.12], [0.30, 0.15]];
for (const [x, y] of moves) stroke.points.push({ x, y, p: 0.5 });
const up = { x: 0.34, y: 0.17 };
const last = stroke.points[stroke.points.length - 1];
const droppedPx = Math.hypot((up.x - last.x) * 1536, (up.y - last.y) * 1024);
console.log(`\nterminal sample: last appended=(${last.x},${last.y}) pointerup=(${up.x},${up.y}) -> ${droppedPx.toFixed(0)} px of tail never inked/saved`);
