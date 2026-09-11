export type Point = { x: number; y: number; p: number };
export type Stroke = { eraser: boolean; points: Point[] };
export type Drawing = Stroke[];
export const DRAFT_KEY = "incant-drawing-v2";
export function validDrawing(value: unknown): value is Drawing {
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
          (p: Point) =>
            p &&
            [p.x, p.y, p.p].every(Number.isFinite) &&
            p.x >= 0 &&
            p.x <= 1 &&
            p.y >= 0 &&
            p.y <= 1 &&
            p.p >= 0 &&
            p.p <= 1,
        ),
    )
  );
}
export function hasInk(strokes: Drawing) {
  return strokes.some((s) => !s.eraser && s.points.length > 0);
}
