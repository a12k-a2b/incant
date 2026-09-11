import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
const base = "https://incant-web-production.up.railway.app";
const key = (await readFile(".env.access", "utf8")).trim().split("=")[1];
const checks: Record<string, unknown> = {
  date: new Date().toISOString(),
  url: base,
};
const health = await fetch(base + "/health");
checks.health = health.status;
const blocked = await fetch(base + "/api/cast", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    incantation: "must not be billed",
    sketchPngBase64: "invalid",
  }),
});
checks.unauthenticatedCast = blocked.status;
const bad = await fetch(base + "/api/unlock", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ password: "wrong-synthetic-key" }),
});
checks.wrongPassphrase = bad.status;
const login = await fetch(base + "/api/unlock", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ password: key }),
});
const cookie = login.headers.get("set-cookie") || "";
checks.correctPassphrase = login.status;
checks.cookieSecure =
  cookie.includes("Secure") &&
  cookie.includes("HttpOnly") &&
  cookie.includes("SameSite=Strict");
const session = await fetch(base + "/api/session", {
  headers: { Cookie: cookie.split(";")[0] },
}).then((r) => r.json());
checks.serverProviders = session;
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    "/Users/anjan/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
});
try {
  const context = await browser.newContext({
      viewport: { width: 1200, height: 1600 },
    }),
    page = await context.newPage();
  await page.goto(base);
  await page.getByLabel("Room passphrase").fill(key);
  await page
    .getByRole("button", { name: "Open the room", exact: true })
    .click();
  await page.locator("canvas").waitFor();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.locator("canvas").waitFor();
  await context.setOffline(true);
  const r = (await page.locator("canvas").boundingBox())!;
  await page.mouse.move(r.x + r.width * 0.3, r.y + r.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width * 0.5, r.y + r.height * 0.3, {
    steps: 12,
  });
  await page.mouse.up();
  await page
    .getByLabel("THE INCANTATION", { exact: true })
    .fill("An offline spell saved for later");
  await page.reload();
  await page.locator("canvas").waitFor();
  checks.offlineDraft =
    (await page.getByLabel("THE INCANTATION", { exact: true }).inputValue()) ===
      "An offline spell saved for later" &&
    !(await page.getByText("Begin with a scribble").isVisible());
  await context.setOffline(false);
  await page.screenshot({
    path: "../docs/evidence/hosted-dc1.png",
    fullPage: true,
  });
} catch (e) {
  checks.browserError = e instanceof Error ? e.message : "Browser check failed";
} finally {
  await browser.close();
  await writeFile(
    "../docs/evidence/hosted-smoke.json",
    JSON.stringify(checks, null, 2),
  );
  console.log(JSON.stringify(checks, null, 2));
}
