import type { Point } from "./drawing";

/** Consume one browser batch once; never sample only its final position. */
export function inkSamples(event: PointerEvent): PointerEvent[] {
  const samples = event.getCoalescedEvents?.();
  return samples?.length ? samples : [event];
}

/** Bounds belong to the batch, not each sample. No DOM reads in this helper. */
export function inkPoint(event: PointerEvent, bounds: DOMRect): Point {
  return {
    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
    y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    p: event.pressure || 0.45,
  };
}
