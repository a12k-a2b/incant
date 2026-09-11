**Source-only review.** No files were read beyond the two you pasted, and nothing was changed.

The synthetic results and the user report are not the same bug. Treat them as two defects that can coincide on DC-1.

## Observed vs hypothesized

**Observed (synthetic, reproducible in Chromium):**

1. Pen `pointerdown` / `pointerup` with **right button, `buttons=2`, `force=0`** commits a visible dot on the parchment.
2. A cancelable `contextmenu` dispatch is **unprevented** on canvas, frame, and help.
3. The same dispatch **is prevented** on the wand / peel control.

**Not observed (hypothesis about the user’s DC-1):**

That “stylus near the screen” is barrel-button `pointerdown`, hover-as-contact, Chrome’s long-press timer, palm/finger rest, or TWA mouse emulation. There is no device trace. Proximity can produce a menu **without** a barrel `pointerdown`, and a finger/palm long-press can produce a menu even though the canvas **ignores fingers for ink**.

So: the canvas **will** ink a barrel-only press if Chrome delivers one. That does **not** prove it is what the user is seeing. The menu fix and the ghost-dot fix are related and both worth doing; they are not interchangeable.

## What the canvas actually does

```ts
if (
  locked ||
  pointer.current !== null ||
  !["pen", "mouse"].includes(e.pointerType) ||
  (e.pointerType === "mouse" && e.button !== 0)
)
  return;
```

Mouse secondary is rejected. **Pen secondary is not.** For `pointerType === "pen"`, barrel (`button === 2`, `buttons === 2`) takes the same path as the tip: `preventDefault`, `setPointerCapture`, start a stroke, paint a point, commit on `pointerup` **and** on `pointercancel` / `lostpointercapture`.

That matches the CDP result exactly.

Eraser is already a **different** bit:

```ts
eraser: tool === "rubber" || e.button === 5 || (e.buttons & 32) !== 0
```

Barrel is **not** eraser in this code. Do not “fix” barrel by mapping it to rubber.

`SketchPeel` is already stricter (`e.button !== 0`, `onContextMenu preventDefault`, abort on `pointercancel`). The parchment is the outlier.

## Pen bitmasks (do not use equality)

| Contact | `button` | `buttons` | Meaning |
|---|---|---|---|
| Tip | `0` | `1` | Primary |
| Barrel / right | `2` | `2` | Secondary, often **hover-capable** |
| Tip + barrel | `0` then `2`, or first event `button=2` | `3` (`1\|2`) | Chorded |
| Back eraser | `5` | `32` | Eraser end |
| Nothing / hover | `-1` or `0` | `0` | Proximity; **`pointerdown` is not proof of contact** |

**Never write `e.buttons === 1`.** Chorded tip+barrel is `3`. A check that requires exactly primary will drop real strokes when the barrel is already down.

Minimum accept/reject for **pen** `pointerdown`:

- **Accept tip:** `(e.buttons & 1) !== 0` **or** `e.button === 0` (covers Chromium’s occasional `buttons === 0` on the first tip down).
- **Accept eraser:** `(e.buttons & 32) !== 0` **or** `e.button === 5`.
- **Reject barrel-only:**  
  `(e.button === 2 || (e.buttons & 2) !== 0)` **and** `(e.buttons & 1) === 0` **and** `(e.buttons & 32) === 0` **and** `e.button !== 5`.

That is “barrel without primary contact or eraser.” It preserves tip, chorded tip+barrel as **ink** (current behavior), and the back eraser.

Do **not** use `e.pressure > 0` as a contact gate. First tip sample is often `0`. Do **not** keep `p: e.pressure || 0.45` if you care about hover/barrel dots: `0` is falsy, so a force-0 event is painted at `0.45` and the `a === b` arc makes a single point visible.

## Hover-to-contact and stolen strokes

Barrel-in-proximity is the dangerous sequence on a hover-capable DC-1 stylus:

1. Hover + barrel → `pointerdown` `button=2` `buttons=2` `pressure=0`.
2. Canvas captures the pointer and paints a dot.
3. Real tip contact is **ignored** because `pointer.current !== null`.
4. Release / Chrome menu / cancel **commits** the ghost stroke (`finish` is used for up, cancel, and lost capture).

Rejecting barrel-only **before** `setPointerCapture` is required. If you capture first, you still steal the following tip down.

Hover with **no** buttons (`buttons === 0`) is a separate hypothesis. The proposed barrel filter does **not** catch a buggy `button === 0 && buttons === 0` down. Only add a `buttons === 0` reject if you also keep `e.button === 0` as an accept for tip (otherwise you will drop real first points). Prefer not to gate on `buttons === 0` until a DC-1 trace shows it.

## Chorded transitions

- Tip down, then barrel: extra `pointerdown` is already ignored (`pointer.current !== null`). Eraser flag is latched at down, so mid-stroke barrel does not become rubber. Keep that.
- Barrel down (hover), then tip: today the barrel owns the pointer. After the fix, the **tip** down must still be accepted when `buttons === 3`. That is why the reject must be barrel-**only**, not “any `button === 2`” and not “`buttons !== 1`”.
- Eraser + anything: accept if bit `32` or `button === 5` is present, even if barrel is also down (`buttons === 34`).

## Capture / cancel (ghost-dot commit)

`finish` on `pointercancel` and `lostpointercapture` **saves** the in-progress stroke. That is wrong for menu interruption, capture loss, and barrel abort.

- `pointerup` → commit (current `finish`).
- `pointercancel` → **abort**: drop `current`, clear `pointer`, `paint()` to remove the ghost. Do not `changed()`.
- `lostpointercapture` → abort **only if** `current` is still live. After a real `pointerup`, `current` is already null, so a following `lostpointercapture` is a no-op. If you abort unconditionally on lost capture **before** distinguishing that, you will discard committed strokes or double-handle. Gate on `current` / `pointerId`, same as today.

Peel already restores on cancel. Canvas should match that semantics.

## Eraser risks of the proposed filter

| Mapping | If the filter is wrong |
|---|---|
| `button === 5` / `buttons & 32` | Must remain accepted. A blanket `button !== 0` reject **kills the back eraser**. |
| Eraser reported as `button === 0`, `buttons === 32` | Accept via the `32` bit, not only `button === 5`. |
| Eraser reported as `button === 5`, `buttons === 0` | Accept via `button === 5`. |
| DC-1 maps the **eraser end** to `button === 2` | **Not supported today** (barrel is ink, not rubber). The barrel-only reject would also block that mapping. Confirm on hardware before treating barrel as eraser. |
| `buttons === 1` equality | Drops eraser (`32`) and chorded tip+barrel (`3`). |
| Treating barrel as rubber “to be safe” | Changes drawing semantics and is not what this file does. |

Preserve **tip and back eraser**. Do not invent barrel-as-eraser unless a DC-1 trace says the hardware eraser arrives as button 2.

## Context menu vs drawing (two layers)

`e.preventDefault()` on pen `pointerdown` does **not** prove Chrome TWA will suppress `contextmenu`. Your synthetic test dispatched `contextmenu` directly; that only shows **there is no listener** on canvas/frame/help. Wand is the only control that already calls `preventDefault` on `contextmenu`.

App-root **capture** `contextmenu` + `preventDefault`, except native editables, is the right PWA-wide menu lock:

Allow default on `input`, `textarea`, `select`, and `closest('[contenteditable]:not([contenteditable="false"])')`.  
Do **not** `preventDefault` all `touchstart`. That will break dialog scrolling, peel, and buttons. Stylus menus on Android 13 Chrome are `contextmenu` (and selection/callout CSS), not a global touch kill.

`user-select: none` on the app shell plus `-webkit-user-drag: none` on images stops long-press selection and image-save menus. Restore `user-select: text` on editables **and** on any help/error text you still expect people to copy with a stylus. If help has no copy button and context menu is killed, copy is gone.

## Concrete risks of the proposed fix

1. **`buttons === 1` / `button === 0` only** → lost eraser and lost chorded tip+barrel.
2. **`pressure > 0` required** → lost first points / light contact.
3. **Reject all non-zero `button` on pen** → back eraser dead.
4. **Capture before reject** → still steal the real tip stroke.
5. **Commit on cancel** → menu/interrupt still writes a dot.
6. **Root `contextmenu` with no editable exception** → copy/paste in dialogs dies.
7. **Global `touchstart` preventDefault** → dialogs do not scroll; peel/buttons suffer.
8. **App-wide `user-select: none` with no copyable islands** → cannot copy help/errors on a keyboard-less DC-1.
9. **Assuming barrel-only is the user’s menu** → you ship the ghost-dot fix and the menu remains (finger/palm/hover timer).
10. **`pressure || 0.45`** → any accepted zero-force down is still a visible blot.

## Minimum fixes

1. **Canvas `pointerdown`:** reject pen barrel-only as specified (bitmasks, not equality). Keep mouse `button === 0`. Keep eraser `button === 5` / bit `32`. Do not capture or `preventDefault` on the rejected down (let it fall through; the root `contextmenu` handler covers the menu).
2. **Split up vs cancel:** commit only on `pointerup`; abort on `pointercancel`; `lostpointercapture` aborts only if that pointer still owns `current`.
3. **App-root capture `contextmenu`:** `preventDefault` unless the target is a native editable. Do not touch `touchstart`.
4. **CSS:** `user-select: none` in the app shell; `user-select: text` on editables and intentional copy surfaces; `img { -webkit-user-drag: none; user-drag: none; }` (peel already has `draggable={false}`).
5. **Optional but cheap:** `p: e.pressure > 0 ? e.pressure : 0.45` so a true 0 is not coerced if you ever accept a zero-force event.

Do not block all `touchstart`. Do not rewrite as a native view.

## Minimum tests (synthetic is enough to gate; DC-1 still required)

Pen / mouse downs (assert stroke count, eraser flag, no capture on rejects):

- `pen` `button=0` `buttons=1` → one ink stroke.
- `pen` `button=2` `buttons=2` → **no** stroke, no capture.
- `pen` `button=0` `buttons=3` → one **ink** stroke (chorded; not eraser).
- `pen` first `button=2` `buttons=3` (primary already down in the bitmask) → **accept** ink, not reject as barrel-only.
- `pen` `button=5` `buttons=32` → eraser stroke.
- `pen` `button=0` `buttons=32` → eraser stroke (bit `32`, not only `button === 5`).
- `pen` `button=5` `buttons=0` → eraser stroke if you keep the `button === 5` accept.
- `mouse` `button=2` → no stroke (existing).
- `mouse` `button=0` → ink.
- `touch` `pointerdown` → still ignored for ink; dialog scroll still works.

Lifecycle:

- Pen tip down + `pointerup` → committed.
- Pen tip down + `pointercancel` → **not** committed; canvas visually restored.
- `pointerup` then `lostpointercapture` → still one committed stroke, not aborted.

Menu / selection:

- Cancelable `contextmenu` on canvas, frame, help → `defaultPrevented`.
- Same event on `input` / `textarea` / `contenteditable` → **not** prevented; copy/paste still works.
- Wand remains prevented.
- Images are not draggable.
- Non-editable text is not selectable; editable / marked copy regions are.

Do **not** treat “CDP barrel down draws nothing” as proof the user menu is gone. After the patch, still need a DC-1 session: hover only, hover + barrel, tip, eraser end, tip+barrel, finger long-press on canvas and on help, and a dialog that must scroll and copy.

## Transferable DC-1 PWA lessons

1. **TWA is Chrome.** You get Chrome `contextmenu`, image drag, and selection. There is no Activity to eat them.
2. **Hover is a real input** on DC-1. `pointerType === "pen"` + `pointerdown` is not “tip on glass.”
3. **Filter mouse and pen separately.** `button !== 0` only on mouse leaves barrel live on pen.
4. **Bitmasks, not `buttons === 1`.** Chorded barrel is `3`; eraser is `32`.
5. **Barrel is not eraser.** Eraser is `button === 5` / bit `32`. Confirm hardware mapping before collapsing them.
6. **`preventDefault` on `pointerdown` is not a context-menu fix** on Android 13 Chrome. Listen to `contextmenu` in capture at the app root, with editable exceptions.
7. **Do not globally kill `touchstart`.** That is how dialogs scroll and how buttons work. Menu, drag, and selection are different events/CSS.
8. **`setPointerCapture` on a spurious pen down steals the real tip.** Reject before capture.
9. **`pointercancel` is not `pointerup`.** Committing on cancel writes ghost ink when Chrome shows a menu or the OS cancels the pointer.
10. **`pressure || fallback` makes zero-force events visible.** Hover/barrel tests will lie.
11. **Fingers ignored for ink are not ignored for Chrome UI.** A palm or long-press can still open the menu on a canvas with `touch-action: none`.
12. **Synthetic CDP is necessary and insufficient.** Use it to lock bitmasks, cancel vs up, and `contextmenu` default. Confirm hover/proximity on the tablet; do not ship a native rewrite because Chrome menus exist.
