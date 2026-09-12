import { useEffect, type RefObject } from "react";
// Native editing menus remain useful in spell/settings fields. Everything else
// in the room is an application surface, with explicit Save/Share actions.
export function allowsNativeEditing(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  if (
    target.closest(
      "input, textarea, select, option, a[href], audio, video, [data-native-context-menu]",
    )
  )
    return true;
  const editable = target.closest("[contenteditable]");
  return editable instanceof HTMLElement && editable.isContentEditable;
}
export function useNativeInteractionGuard(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const activePens = new Set<number>();
    const blockedTouches = new Set<number>();
    const blockedControls = new Map<Element, number>();
    let lastPenRelease = -Infinity;
    const releaseGuardMs = 250;
    const controlFor = (target: EventTarget | null) =>
      target instanceof Element
        ? target.closest(
            "button, input, textarea, select, a[href], [role='button']",
          )
        : null;
    const penIsDown = (event: PointerEvent) =>
      event.pressure > 0 ||
      (event.buttons & 1) !== 0 ||
      (event.buttons & 32) !== 0;
    const palmWindow = () =>
      activePens.size > 0 ||
      performance.now() - lastPenRelease < releaseGuardMs;
    const blockTouchControl = (event: Event) => {
      const control = controlFor(event.target);
      if (!control || !palmWindow()) return false;
      blockedControls.set(control, performance.now() + releaseGuardMs);
      event.preventDefault();
      event.stopImmediatePropagation();
      return true;
    };
    const pointerGuard = (event: PointerEvent) => {
      if (event.pointerType === "pen") {
        if (penIsDown(event)) activePens.add(event.pointerId);
        else if (activePens.delete(event.pointerId))
          lastPenRelease = performance.now();
        return;
      }
      if (event.pointerType !== "touch") return;
      if (event.type === "pointerdown" && blockTouchControl(event))
        blockedTouches.add(event.pointerId);
      else if (blockedTouches.has(event.pointerId)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.type === "pointerup" || event.type === "pointercancel")
          blockedTouches.delete(event.pointerId);
      }
    };
    const releasePen = (event: PointerEvent) => {
      if (event.pointerType !== "pen") return;
      if (activePens.delete(event.pointerId))
        lastPenRelease = performance.now();
    };
    const touchGuard = (event: TouchEvent) => {
      blockTouchControl(event);
    };
    const clickGuard = (event: MouseEvent) => {
      const control = controlFor(event.target);
      if (!control) return;
      const blockedUntil = blockedControls.get(control) ?? -Infinity;
      if (performance.now() > blockedUntil) {
        blockedControls.delete(control);
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      blockedControls.delete(control);
    };
    const resetPointers = () => {
      activePens.clear();
      blockedTouches.clear();
      blockedControls.clear();
      lastPenRelease = -Infinity;
    };
    const visibilityReset = () => {
      if (document.hidden) resetPointers();
    };
    const guard = (event: Event) => {
      if (allowsNativeEditing(event.target)) return;
      const target = event.target instanceof Element ? event.target : null;
      if (
        event.type === "contextmenu" ||
        target?.closest(".desk") ||
        (event.type === "dragstart" && target?.closest("img"))
      )
        event.preventDefault();
    };
    const events = ["contextmenu", "dragstart", "selectstart"];
    for (const name of events)
      node.addEventListener(name, guard, { capture: true });
    node.addEventListener("pointerdown", pointerGuard, { capture: true });
    node.addEventListener("pointermove", pointerGuard, { capture: true });
    node.addEventListener("pointerup", pointerGuard, { capture: true });
    node.addEventListener("pointercancel", pointerGuard, { capture: true });
    node.addEventListener("lostpointercapture", releasePen, { capture: true });
    node.addEventListener("touchstart", touchGuard, {
      capture: true,
      passive: false,
    });
    node.addEventListener("click", clickGuard, { capture: true });
    window.addEventListener("blur", resetPointers);
    document.addEventListener("visibilitychange", visibilityReset);
    return () => {
      for (const name of events)
        node.removeEventListener(name, guard, { capture: true });
      node.removeEventListener("pointerdown", pointerGuard, { capture: true });
      node.removeEventListener("pointermove", pointerGuard, { capture: true });
      node.removeEventListener("pointerup", pointerGuard, { capture: true });
      node.removeEventListener("pointercancel", pointerGuard, {
        capture: true,
      });
      node.removeEventListener("lostpointercapture", releasePen, {
        capture: true,
      });
      node.removeEventListener("touchstart", touchGuard, { capture: true });
      node.removeEventListener("click", clickGuard, { capture: true });
      window.removeEventListener("blur", resetPointers);
      document.removeEventListener("visibilitychange", visibilityReset);
    };
  }, [root]);
}
