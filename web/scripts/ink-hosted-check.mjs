import { chromium, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const base = "https://incant-web-production.up.railway.app";
const report = {
  time: new Date().toISOString(),
  kind: "Isolated hosted browser, synthetic ink, cloud writes intercepted; no provider call or owner artwork",
  checks: {},
};
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1184, height: 1584 },
  });
  await page.addInitScript(() =>
    localStorage.setItem("incant-introduction-v1", "seen"),
  );
  for (const pattern of ["**/api/backup/**", "**/api/owl**"])
    await page.route(pattern, (route) =>
      route.fulfill({
        status: 503,
        json: { error: "Isolated ink verification" },
      }),
    );
  await page.goto(base);
  const password = (await readFile(".env.access", "utf8")).trim().split("=")[1];
  await page.getByLabel("Room passphrase").fill(password);
  await page
    .getByRole("button", { name: "Open the room", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Dragon settings" }),
  ).toBeEnabled();
  const canvas = page.locator("canvas");
  report.checks.endpoint = await canvas.evaluate((node) => {
    node.setPointerCapture = () => {};
    const r = node.getBoundingClientRect();
    for (const [type, x, buttons] of [
      ["pointerdown", 0.3, 1],
      ["pointermove", 0.4, 1],
      ["pointerup", 0.7, 0],
    ])
      node.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: 74,
          pointerType: "pen",
          button: type === "pointermove" ? -1 : 0,
          buttons,
          pressure: buttons ? 0.5 : 0,
          clientX: r.x + r.width * x,
          clientY: r.y + r.height * 0.5,
        }),
      );
    return (
      node
        .getContext("2d")
        .getImageData(
          Math.floor(node.width * 0.6),
          Math.floor(node.height * 0.5),
          1,
          1,
        ).data[0] < 100
    );
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise((resolve) => {
            const req = indexedDB.open("incant-draft-v1", 1);
            req.onsuccess = () => {
              const db = req.result,
                r = db
                  .transaction("drafts")
                  .objectStore("drafts")
                  .get("revision");
              r.onsuccess = () => {
                db.close();
                resolve(r.result ?? 0);
              };
            };
          }),
      ),
    )
    .toBeGreaterThan(0);
  report.checks.atomicRevision = true;
  const before = await canvas.evaluate((node) => node.toDataURL());
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Dragon settings" }),
  ).toBeEnabled();
  report.checks.reloadSamePixels =
    before === (await canvas.evaluate((node) => node.toDataURL()));
  const html = await (await page.request.get(base)).text();
  const asset = html.match(/src="(\/assets\/[^\"]+\.js)"/)[1];
  const localHtml = await readFile("dist/index.html", "utf8");
  const localAsset = localHtml.match(/src="(\/assets\/[^\"]+\.js)"/)[1];
  const live = await (await page.request.get(base + asset)).body();
  const local = await readFile("dist" + localAsset);
  report.checks.applicationJavaScriptMatchesTestedBuild = live.equals(local);
  report.javascriptSha256 = createHash("sha256").update(live).digest("hex");
  report.status = Object.values(report.checks).every(Boolean) ? "PASS" : "FAIL";
  if (report.status !== "PASS") process.exitCode = 1;
} catch (error) {
  report.status = "FAIL";
  report.error = String(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(
    "../docs/ink-hardening-2026-09-12/hosted-check.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
}
