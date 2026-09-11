import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("incant-introduction-v1", "seen"),
  );
});
test("room blocks native menu and image drag, while editing and external controls remain native", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("canvas").waitFor();
  const result = await page.evaluate(() => {
    const root = document.querySelector("main")!;
    const img = document.createElement("img");
    img.id = "menu-image";
    document.querySelector(".paper")!.append(img);
    const outside = document.createElement("div");
    outside.id = "outside-native";
    document.body.append(outside);
    const fixtures = document.createElement("div");
    fixtures.innerHTML =
      '<input id="native-input"><textarea id="native-text"></textarea><div id="native-edit" contenteditable="plaintext-only"><span>Editable</span></div><a id="native-link" href="#">Link</a><video id="native-video" controls></video><div id="native-optout" data-native-context-menu>Copyable</div>';
    root.querySelector(".desk")!.append(fixtures);
    const dispatch = (selector: string, type = "contextmenu") => {
      const e = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 2,
        buttons: 2,
      });
      document.querySelector(selector)!.dispatchEvent(e);
      return e.defaultPrevented;
    };
    return {
      protected: [
        "canvas",
        ".paper-wrap",
        ".room-help",
        "#menu-image",
        ".voice-wand",
      ].map((s) => dispatch(s)),
      native: [
        "#native-input",
        "#native-text",
        "#native-edit span",
        "#native-link",
        "#native-video",
        "#native-optout",
        "#outside-native",
      ].map((s) => dispatch(s)),
      drag: dispatch("#menu-image", "dragstart"),
      selection: dispatch(".room-help", "selectstart"),
      editingSelection: dispatch("#native-text", "selectstart"),
    };
  });
  expect(result.protected.every(Boolean)).toBe(true);
  expect(result.native.every((v) => !v)).toBe(true);
  expect(result.drag).toBe(true);
  expect(result.selection).toBe(true);
  expect(result.editingSelection).toBe(false);
  await page.getByRole("button", { name: "Type a spell", exact: true }).click();
  const field = page.getByLabel("Type your spell");
  await field.fill("A test spell");
  await field.press("ControlOrMeta+A");
  expect(
    await field.evaluate(
      (e: HTMLTextAreaElement) => e.selectionEnd - e.selectionStart,
    ),
  ).toBe(12);
  await expect(field).toHaveCSS("user-select", "text");
});
test("real Chromium pen barrel-only press changes neither pixels nor saved draft; tip remains functional", async ({
  page,
}) => {
  await page.goto("/");
  const canvas = page.locator("canvas");
  await canvas.waitFor();
  const png = () => canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const before = await png();
  const state = () =>
    page.evaluate(() =>
      JSON.stringify(
        Object.entries(localStorage).filter(([k]) =>
          k.startsWith("incant-drawing-v2"),
        ),
      ),
    );
  const saved = await state();
  const b = (await canvas.boundingBox())!,
    cdp = await page.context().newCDPSession(page),
    x = b.x + b.width * 0.5,
    y = b.y + b.height * 0.5;
  for (const type of ["mousePressed", "mouseReleased"] as const)
    await cdp.send("Input.dispatchMouseEvent", {
      type,
      x,
      y,
      button: "right",
      buttons: type === "mousePressed" ? 2 : 0,
      pointerType: "pen",
      force: 0,
    });
  expect(await png()).toBe(before);
  expect(await state()).toBe(saved);
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    buttons: 1,
    pointerType: "pen",
    force: 0,
  });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    buttons: 0,
    pointerType: "pen",
    force: 0,
  });
  expect(await png()).not.toBe(before);
  expect(await state()).not.toBe(saved);
});
test("barrel-first chord starts only at contact and stops at tip lift, with no hover trail", async ({
  page,
}) => {
  await page.goto("/");
  const canvas = page.locator("canvas");
  await canvas.waitFor();
  await canvas.evaluate((c: HTMLCanvasElement) => {
    c.setPointerCapture = () => {};
  });
  const b = (await canvas.boundingBox())!;
  const png = () => canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const before = await png();
  const send = (
    type: string,
    button: number,
    buttons: number,
    px: number,
    pressure = 0,
  ) =>
    canvas.dispatchEvent(type, {
      pointerType: "pen",
      pointerId: 83,
      button,
      buttons,
      pressure,
      clientX: b.x + b.width * px,
      clientY: b.y + b.height * 0.5,
    });
  await send("pointerdown", 2, 2, 0.2);
  await send("pointermove", -1, 2, 0.3);
  expect(await png()).toBe(before);
  await send("pointermove", 0, 3, 0.4, 0.5);
  await send("pointermove", -1, 3, 0.5, 0.5);
  const ink = await png();
  expect(ink).not.toBe(before);
  await send("pointermove", 0, 2, 0.6);
  await send("pointermove", -1, 2, 0.8);
  await send("pointerup", 2, 0, 0.8);
  expect(await png()).toBe(ink);
  await page.reload();
  await canvas.waitFor();
  expect(await png()).toBe(ink);
});
test("anomalous barrel button zero cannot ink; tip-first chord and cancel preserve real ink", async ({
  page,
}) => {
  await page.goto("/");
  const canvas = page.locator("canvas");
  await canvas.waitFor();
  await canvas.evaluate((c: HTMLCanvasElement) => {
    c.setPointerCapture = () => {};
  });
  const b = (await canvas.boundingBox())!,
    png = () => canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const before = await png();
  const send = (
    type: string,
    button: number,
    buttons: number,
    px: number,
    pressure = 0,
  ) =>
    canvas.dispatchEvent(type, {
      pointerType: "pen",
      pointerId: 91,
      button,
      buttons,
      pressure,
      clientX: b.x + b.width * px,
      clientY: b.y + b.height * 0.5,
    });
  await send("pointerdown", 0, 2, 0.2);
  await send("pointerup", 2, 0, 0.2);
  expect(await png()).toBe(before);
  await send("pointerdown", 0, 1, 0.3, 0.5);
  await send("pointermove", 2, 3, 0.4, 0.5);
  await send("pointermove", -1, 3, 0.5, 0.5);
  const ink = await png();
  expect(ink).not.toBe(before);
  await send("pointermove", 0, 2, 0.6);
  await send("pointercancel", -1, 0, 0.8);
  expect(await png()).toBe(ink);
  await page.reload();
  await canvas.waitFor();
  expect(await png()).toBe(ink);
});

test("legacy tools dialog still scrolls and allows plain-text selection", async ({
  page,
}) => {
  await page.setViewportSize({ width: 420, height: 500 });
  await page.goto("/?mode=desk");
  await page
    .getByRole("button", { name: "Open desk tools", exact: true })
    .click();
  const dialog = page.locator(".desk-drawer");
  await expect(dialog).toBeVisible();
  const bounds = (await dialog.boundingBox())!;
  await page.mouse.move(
    bounds.x + bounds.width * 0.5,
    bounds.y + bounds.height * 0.5,
  );
  await page.mouse.wheel(0, 450);
  await expect
    .poll(() => dialog.evaluate((d) => d.scrollTop))
    .toBeGreaterThan(0);
  const allowed = await dialog.evaluate((d) => {
    const p = document.createElement("p");
    p.textContent = "Synthetic selectable help text";
    d.append(p);
    const event = new Event("selectstart", { bubbles: true, cancelable: true });
    p.dispatchEvent(event);
    const range = document.createRange();
    range.selectNodeContents(p);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    return {
      prevented: event.defaultPrevented,
      selection: selection.toString(),
      css: getComputedStyle(p).userSelect,
    };
  });
  expect(allowed.prevented).toBe(false);
  expect(allowed.selection).toBe("Synthetic selectable help text");
  expect(allowed.css).not.toBe("none");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});
