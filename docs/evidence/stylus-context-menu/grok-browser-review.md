**Source-only review.** No files were opened, no tools were used, nothing was changed. The CDP/contextmenu results in the prompt are treated as lab evidence, not as a device trace.

## Observed vs hypothesis

Keep these apart. They are not the same bug.

| Claim | Status | What it actually shows |
|---|---|---|
| Chrome long-press/context menu appears when the stylus is *near* the screen | **User report only** | Unreproduced. No hover/proximity trace. |
| Cancelable `contextmenu` is unprevented on canvas, frame, help | **Observed (synthetic dispatch)** | Those nodes have no capturing preventDefault. Wand already prevents. |
| Wand peel button prevents `contextmenu` | **Observed** | Matches `SketchPeel` `onContextMenu={(e) => e.preventDefault()}`. |
| CDP pen `mousePressed` right / `buttons=2` / `force=0` then release paints a canvas dot | **Observed (synthetic)** | Canvas treats pen non-primary downs as ink. |
| Hover/proximity *causes* the menu | **Hypothesis** | Hover is usually `pointermove` with `buttons=0`, not `pointerdown`. CDP right-press is not “near the screen.” |
| Hover/proximity *causes* ghost ink | **Not supported** | The dot path requires a `pointerdown` the canvas accepts. |
| Barrel-only reject will fix the user’s intermittent menu | **Hypothesis** | It should stop the CDP dot. It will not, by itself, suppress a hover-generated Chrome menu. |

On DC-1 Chrome TWA, “stylus near screen” is more likely (a) hover mouse-emulation, (b) barrel/side button, (c) a micro-contact that still looks like hover, or (d) the long-press timer after light contact. Lab input only proves (b) for ink and the missing `contextmenu` handlers for menus.

**Do not ship a writeup that says the device bug is barrel-click.** Say: menus leak because `contextmenu` is not captured at app root; canvas ink accepts pen secondary; the user’s proximity report is still unverified.

---

## What the given code actually does

### `SketchCanvas` — this is the ink defect

`pointerdown` rejects mouse non-primary, then **accepts every pen button**:

```text
!["pen","mouse"].includes(e.pointerType)  → ignore fingers
pointerType === "mouse" && button !== 0  → ignore mouse right/middle
pointerType === "pen"                    → no button filter
```

Then it always:

1. `preventDefault()` (does **not** reliably kill Android Chrome’s menu)
2. `setPointerCapture`
3. starts a stroke
4. `segment(p, p)` which **fills a dot** when `a.x === b.x && a.y === b.y`

Eraser is inferred with `button === 5` or `buttons & 32`. Barrel/right is `button === 2` / `buttons & 2`. Those are different bits. A barrel-only down is not an eraser down, but it still inks.

`p: e.pressure || 0.45` makes `force=0` **look like a real mark**. That is why the CDP case is so visible. Do **not** use `pressure === 0` / `force === 0` as a reject rule: many pens report 0 on first contact.

`pointerup` / `pointercancel` / `lostpointercapture` all **commit**. If Chrome cancels a bad down because a menu opened, a one-point stroke is stored. Barrel reject must happen **before** capture and `current` is set.

Canvas has `touch-action: none` (correct, local) and **no** `contextmenu` listener. That matches “unprevented on canvas.”

### `SketchPeel` — image menu, not the canvas dot

- Peel **button** prevents `contextmenu` (matches “prevented on wand”).
- Comparison **`<img>`** only sets `draggable={false}`.
- On Android Chrome TWA, that does **not** block long-press “Save image” / share. `draggable={false}` is HTML5 drag, not the Chrome image callout.

Root capture would cover the img; the button-only handler will not.

---

## Proposed fix — verdict

The shape is right for a TWA: **app-shell owns browser defaults; the canvas owns ink buttons.** Do not do this with a global `touchstart` `preventDefault`.

### 1. Capture-phase `contextmenu` on app root, except native editables

**Do this.** Component handlers (wand, peel button) are why frame/help/canvas still leak.

Minimum predicate (target or `composedPath()`, not just `event.target`):

Allow default only for:

- `textarea`
- `select`
- `input` types that actually edit text: `text`, `search`, `password`, `email`, `url`, `tel`, `number` (and `input` with no type)
- `[contenteditable]` other than `contenteditable="false"` (`true` and `plaintext-only`)

Do **not** treat as editable: `button`, `submit`, `reset`, `checkbox`, `radio`, `range`, `file`, `color`, `hidden`, `image`.

Also walk `closest(...)` so a click on inner text/SVG inside a field still copies.

**Risks**

- Incomplete whitelist → copy/paste/IME/select-all die in dialogs.
- `role="textbox"` without a native field: no browser edit menu anyway; don’t special-case unless you have one.
- Capture `preventDefault` does not stop a child from showing a **custom** menu; it only kills Chrome’s. Fine.
- Desktop right-click Inspect is annoying in local Chrome. Optional: skip in `import.meta.env.DEV`. Irrelevant in TWA.
- Residual Chromium risk: some Android pen/long-press menus are **not** fully cancelable even when a synthetic `Event("contextmenu", {cancelable:true})` is. Treat synthetic `defaultPrevented` as necessary, not sufficient, on device.

### 2. Kill image drag + non-editable selection inside the app

**Do this, narrowly.**

CSS on the app shell, not on `document.body` via JS:

```text
.app {
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}
.app img, .app canvas {
  -webkit-user-drag: none;
  user-drag: none;
  -webkit-touch-callout: none;
}
.app input, .app textarea,
.app [contenteditable="true"],
.app [contenteditable="plaintext-only"] {
  -webkit-user-select: text;
  user-select: text;
  -webkit-touch-callout: default;
}
```

Keep `draggable={false}` on `SketchPeel`’s img as defense in depth; add `onDragStart={(e) => e.preventDefault()}` if you want a test hook.

**Risks**

- Help / dialog **body copy** dies unless you add a `.copyable { user-select: text; -webkit-touch-callout: default; }` (and do **not** prevent `contextmenu` on `.copyable` if you want “Copy”). The prompt’s “don’t break copy/paste” only holds for **native fields** unless you do this.
- `user-select: none` does **not** block dialog scrolling. `touch-action: none` on the root **would**. Do not set that except on the canvas (already set).
- `:not(input):not(textarea)` descendant selectors fail inside `contenteditable`. Prefer “none on root, text on fields.”

### 3. Reject pen barrel-only `pointerdown`; keep tip and back eraser

**Do this on the canvas only.** Unify mouse/pen with button identity, not `force`.

Accept ink iff:

- `pointerType` is `pen` or `mouse` (fingers stay ignored), and
- **primary tip:** `button === 0` (or `buttons & 1`), or
- **eraser:** `pointerType === "pen"` and (`button === 5` or `buttons & 32`)

Reject:

- pen `button === 2` / `buttons === 2` (barrel-only, the CDP case)
- mouse `button !== 0` (already)
- any pen button that is not 0 or 5

Keep **chorded** tip+barrel: `button === 0` and `buttons === 3` must still draw.

On **rejected** canvas pen secondary: still `preventDefault()` so the event does not fall through as a click/menu, but **do not** capture or start `current`. Then `pointercancel` / `lostpointercapture` cannot commit a ghost stroke.

**Do not**

- reject `pressure === 0`
- reject `buttons === 0` when `button === 0` (some first-contact frames)
- map barrel to eraser
- call `finish()` for a down you never accepted

**Risks**

- OEM mapping: a few styli fire inverted eraser as something other than button 5 / bit 32. If DC-1’s eraser is already working in product, keep the current eraser test and only add the barrel reject.
- If DC-1 maps the side button to Android BACK/home, this JS path never sees it — another reason not to claim the user report is this bug.

### 4. Explicit non-goals (these would break the product)

- No document/`touchstart` `preventDefault` (breaks dialog scroll, buttons, click generation; `touchstart` is often passive).
- No app-wide `touch-action: none`.
- No `preventDefault` on `copy` / `cut` / `paste` / `beforeinput`.
- No blocking `pointerType === "touch"` globally (dialogs, peel, chrome).
- No native rewrite.

---

## Concrete risks if the proposed fix is implemented carelessly

1. **Copy/paste in settings/help/dialogs** — whitelist miss on `contenteditable="plaintext-only"`, nested spans, or `input type="search"`.
2. **Select-all / “Copy” on help copy** — if that is required, root `user-select: none` plus blanket `contextmenu` prevent is a product regression; carve out `.copyable`.
3. **Image comparison** — root handler must include the peel `<img>`, not only the wand button.
4. **Ghost ink still committed** — if barrel reject happens *after* `current` is set, or if `lostpointercapture` still calls `finish()` for a rejected id (it shouldn’t, if `pointer.current` stayed null).
5. **Eraser broken** — if someone writes `button === 0` only and drops button 5.
6. **First point of real strokes dropped** — if someone keys off `force`/`pressure`.
7. **Dialog scroll / pinch** — only if a global touch prevent or root `touch-action: none` sneaks in.
8. **A11y** — Android selection handles and “Copy” vanish on static text; screen readers are mostly fine. Keyboard `Shift+F10` / context-menu key on a desktop PWA session would only work inside fields.
9. **False confidence** — green CDP + jsdom `contextmenu` tests with **no hover test** will not validate the user’s “near the screen” report.
10. **Uncancelable device menu** — if DC-1 Chrome still shows the menu after `preventDefault`, you need a device trace (`chrome://input-debugger`, pointer log: `pointerType`, `button`, `buttons`, `pressure`, `isPrimary`, `pointerdown` vs `pointermove` vs `contextmenu` cancelable). Do not pile on `touchstart` hacks next.

---

## Minimum fixes (in order)

1. **Canvas `down`:** accept only primary or eraser; reject barrel-only; never capture/ink on reject; `preventDefault` on reject at the canvas.
2. **App root, capture:** `contextmenu` → `preventDefault` unless native editable as above.
3. **App CSS:** `user-select` / `-webkit-touch-callout` / `-webkit-user-drag` as above; restore text selection on editables; optional `.copyable` for help.
4. **Images:** keep `draggable={false}`; rely on root menu + callout CSS (peel img included).
5. **Leave `touch-action: none` on the canvas only.** No global touch listeners.

That is enough for the **observed** menu leak and the **observed** CDP dot. Anything aimed at hover is extra and unproven.

---

## Minimum tests (regression suite, not a device substitute)

Drive **button bits**, not screenshots of pressure.

**Ink (canvas)**

- pen `button=2`, `buttons=2`, `pressure=0` → no stroke, `isEmpty()` true, no capture.
- pen `button=0`, `buttons=1` → stroke; coincident down still allowed to make a real dot.
- pen `button=5` or `buttons=32` → eraser stroke (`stroke.eraser === true`).
- pen `button=0`, `buttons=3` (tip+barrel) → still inks.
- mouse `button=2` → no ink (existing).
- mouse `button=0` → inks.
- `pointerType=touch` → ignored.
- `locked` → ignored.
- rejected barrel must **not** become a stroke via `pointerup` / `pointercancel` / `lostpointercapture`.

**Menus (dispatch cancelable, bubbling `contextmenu`; assert `defaultPrevented`)**

- canvas, app frame, help: prevented.
- wand/peel button: still prevented.
- peel `<img>`: prevented.
- `input[type=text]`, `textarea`, `contenteditable`: **not** prevented.
- `input[type=button]` / toolbar buttons: prevented (not editable).

**Selection / drag**

- `dragstart` on comparison img: prevented / `draggable === false`.
- `getSelection()` on a help paragraph: empty unless `.copyable`.
- In a text `input`: select + copy still works (execCommand or `select()` + clipboard in the harness you already use).

**Must-not-regress**

- No `touchstart` listener on `document`/`#root` that `preventDefault`s.
- Dialog/help overflow element: computed `touch-action` is not `none`; a `touchstart` inside it is not canceled by app code.
- Canvas computed `touch-action` remains `none`.

**CDP (keep, but label it)**

- Current pen right-press/release: **no new ink**. This tests barrel-only, **not** hover.

**Missing until a physical trace**

- `mouseMoved` / pen hover, `buttons=0`, no down: no ink (should already pass) **and** no menu. The menu half is not reliably observable via CDP. Log the real event stream on DC-1 before claiming the user-facing intermittent bug is gone.

Do not assert “no dot” via `pressure===0` rendering; assert stroke list / `hasInk`.

---

## Accessibility

- Native fields must keep: selection, long-press handles, Copy/Paste/Cut, IME, password manager context menus.
- Static chrome can lose selection; that is a trade for TWA polish. If spells, errors, or help must be copyable, whitelist those nodes for both CSS selection **and** `contextmenu`.
- Canvas `aria-label` can stay; this change is not a canvas a11y fix.
- Do not set `aria-disabled` or `pointer-events: none` on the app root as a menu hack.

---

## Transferable DC-1 / Chrome TWA PWA lessons

1. **TWA is still Chrome.** Long-press menus, image save, and selection toolbars are browser chrome. You suppress them with `contextmenu` + `-webkit-touch-callout` + `user-select`, not with Android APIs.
2. **App shell owns default suppression; widgets own gestures.** A wand `onContextMenu` will never save the canvas, help, or frame.
3. **`draggable={false}` ≠ no image long-press** on Android Chrome. You need callout CSS and `contextmenu` too.
4. **Pen is not a mouse.** If mouse right is ignored, pen `button=2` must be ignored for ink. Eraser is `button=5` / bit 32, not the barrel.
5. **Hover is not `pointerdown`.** CDP `mousePressed` right does not simulate “stylus near.” Don’t close a proximity bug with a barrel unit test.
6. **`pressure === 0` is a normal first sample.** Never gate ink on force.
7. **`touch-action: none` is a drawing-surface property**, not an app-root property. Global `touchstart` preventDefault is how you break dialog scroll on a tablet.
8. **Whitelist native editables by element/type**, not by component name, so future dialogs don’t regress copy/paste.
9. **`pointercancel` / `lostpointercapture` commit paths** will persist accidental UI gestures unless you refuse the down.
10. **Synthetic `contextmenu` being cancelable is a good unit test and a weak device test.** Confirm on hardware if the menu is the actual user complaint.
11. **A fullscreen TWA makes Chrome’s menu feel like an OS crash.** Same leak is easier to ignore in a normal tab; still fix it in the shell.

The proposed approach is the right TWA fix **for the observed leaks and the observed barrel dot**, if editable exceptions, image callout, and canvas button filtering are implemented as specified — and if the proximity report is tracked separately until a DC-1 event log exists.
