import { test, expect } from "@playwright/test";
// R-01: illustrated frame controls (moon, owl, dragon, books) are positioned by
// percentage of the whole room and overlap the drawable parchment rectangle.
// Check what actually receives a pointer at parchment points, then prove a
// short pen/mouse mark in the overlap wipes the page via the moon.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("incant-introduction-v1", "seen"),
  );
});
for (const [name, width, height] of [
  ["dc1-portrait", 1184, 1584],
  ["dc1-landscape", 1584, 1184],
] as const) {
  test(`parchment hit map ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    const canvas = page.locator("canvas");
    await canvas.waitFor();
    const paper = (await page.locator(".paper").boundingBox())!;
    const report = await page.evaluate((paper) => {
      const rows: string[] = [];
      const cols = 20,
        lines = 26;
      let stolen = 0,
        total = 0;
      const owners = new Map<string, number>();
      for (let j = 0; j < lines; j++) {
        let row = "";
        for (let i = 0; i < cols; i++) {
          const x = paper.x + ((i + 0.5) / cols) * paper.width,
            y = paper.y + ((j + 0.5) / lines) * paper.height;
          const el = document.elementFromPoint(x, y) as HTMLElement | null;
          total++;
          const tag =
            el?.tagName === "CANVAS"
              ? "."
              : el?.classList.contains("moon-key") ||
                  el?.closest(".moon-key")
                ? "M"
                : el?.closest(".owl-key")
                  ? "O"
                  : el?.closest(".dragon-key")
                    ? "D"
                    : el?.closest(".spellbooks-key")
                      ? "B"
                      : el?.closest(".typewriter-key")
                        ? "T"
                        : el?.closest(".wand-rest")
                          ? "W"
                          : el?.closest(".room-help")
                            ? "?"
                            : "x";
          if (tag !== ".") {
            stolen++;
            owners.set(tag, (owners.get(tag) || 0) + 1);
          }
          row += tag;
        }
        rows.push(row);
      }
      return { rows, stolen, total, owners: [...owners] };
    }, paper);
    console.log(
      `[${name}] paper=${JSON.stringify(paper)} stolen=${report.stolen}/${report.total} owners=${JSON.stringify(report.owners)}\n` +
        report.rows.join("\n"),
    );
    // Evidence only: record how much of the parchment is not reachable by the pen.
    expect(report.total).toBeGreaterThan(0);
  });
}
test("a short mark in the top-right of the parchment turns the moon and wipes the page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1184, height: 1584 });
  await page.goto("/");
  const canvas = page.locator("canvas");
  const paper = (await page.locator(".paper").boundingBox())!;
  // Draw a real line in the middle of the page first.
  await page.mouse.move(paper.x + paper.width * 0.4, paper.y + paper.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(paper.x + paper.width * 0.6, paper.y + paper.height * 0.5, {
    steps: 6,
  });
  await page.mouse.up();
  const inked = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const strokes = await page.evaluate(
    () => JSON.parse(localStorage.getItem("incant-drawing-v2") || "[]").length,
  );
  expect(strokes).toBe(1);
  // Now a small "star" in the sky: a dot at 88% across, 13% down the parchment.
  const sx = paper.x + paper.width * 0.88,
    sy = paper.y + paper.height * 0.13;
  const hit = await page.evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x, y) as HTMLElement;
      const b = el.closest("button");
      return (b || el).getAttribute("aria-label") || el.tagName;
    },
    [sx, sy],
  );
  console.log("element under the star point:", hit);
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 4, sy + 3);
  await page.mouse.up();
  let turning = 0;
  await expect
    .poll(async () => (turning = await page.locator(".turning-moon").count()), {
      timeout: 4000,
    })
    .toBe(1)
    .catch(() => {});
  console.log("turning-moon after the dot:", turning);
  await page.waitForTimeout(3500);
  const after = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const strokesAfter = await page.evaluate(
    () => JSON.parse(localStorage.getItem("incant-drawing-v2") || "[]").length,
  );
  console.log("strokes after:", strokesAfter, "canvas changed:", after !== inked);
  expect(hit).toBe("New spell — turn the moon");
  expect(turning).toBe(1);
  expect(strokesAfter).toBe(0);
  // Is the wiped sketch reachable from the illustrated books?
  await page.getByRole("button", { name: "Open saved spells" }).click();
  const dialog = page.getByRole("dialog", { name: "Your saved spells" });
  await expect(dialog).toBeVisible();
  const text = await dialog.innerText();
  const openButtons = await dialog
    .getByRole("button", { name: /^Open/ })
    .count();
  console.log("library text:", text.replace(/\s+/g, " ").slice(0, 300));
  console.log("buttons that reopen anything:", openButtons);
  expect(text).toContain("0 generations");
  expect(openButtons).toBe(0);
});
