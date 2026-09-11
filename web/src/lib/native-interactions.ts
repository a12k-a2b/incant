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
    return () => {
      for (const name of events)
        node.removeEventListener(name, guard, { capture: true });
    };
  }, [root]);
}
