import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
const base = process.env.INCANT_URL || "http://127.0.0.1:5173";
const prefix = base.startsWith("https:") ? "hosted-final-" : "live-";
const evidence = new URL("../../docs/evidence/", import.meta.url);
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    "/Users/anjan/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
});
const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
const receipt: { [key: string]: unknown } = {
  date: new Date().toISOString(),
  type: "live-provider-synthetic-sketch",
  model: "gpt-image-2.5-flare",
};
try {
  await page.goto(base);
  if (base.startsWith("https:")) {
    const key = (await readFile(".env.access", "utf8")).trim().split("=")[1];
    await page.getByLabel("Room passphrase").fill(key);
    await page
      .getByRole("button", { name: "Open the room", exact: true })
      .click();
  }
  await page.locator("canvas").waitFor();
  const r = (await page.locator("canvas").boundingBox())!;
  const line = async (points: number[][]) => {
    await page.mouse.move(
      r.x + points[0][0] * r.width,
      r.y + points[0][1] * r.height,
    );
    await page.mouse.down();
    for (const [x, y] of points.slice(1))
      await page.mouse.move(r.x + x * r.width, r.y + y * r.height, {
        steps: 6,
      });
    await page.mouse.up();
  };
  await line([
    [0.2, 0.55],
    [0.5, 0.28],
    [0.8, 0.55],
    [0.2, 0.55],
  ]);
  await line([
    [0.27, 0.55],
    [0.27, 0.8],
    [0.73, 0.8],
    [0.73, 0.55],
  ]);
  await line([
    [0.44, 0.8],
    [0.44, 0.64],
    [0.56, 0.64],
    [0.56, 0.8],
  ]);
  await line([
    [0.62, 0.33],
    [0.62, 0.24],
    [0.7, 0.24],
    [0.7, 0.4],
  ]);
  await line([
    [0.12, 0.81],
    [0.86, 0.81],
  ]);
  await page
    .getByLabel("THE INCANTATION", { exact: true })
    .fill(
      "A cozy little wizard cottage under the moon, moss on its roof, a glowing round window, gentle storybook ink illustration. Preserve the triangular roof and the composition of my sketch.",
    );
  await page.screenshot({
    path: new URL(prefix + "sketch.png", evidence).pathname,
    fullPage: true,
  });
  const start = Date.now();
  const responsePromise = page.waitForResponse("**/api/cast", {
    timeout: 190000,
  });
  await page.getByRole("button", { name: "Cast spell", exact: true }).click();
  const response = await responsePromise;
  const result = await response.json();
  receipt.elapsedMs = Date.now() - start;
  receipt.httpStatus = response.status();
  receipt.imageCast = result.ok ? "PASS" : "FAIL";
  if (result.ok) {
    await page
      .getByRole("button", { name: "Save image", exact: true })
      .waitFor({ timeout: 10000 });
    await writeFile(
      new URL(prefix + "manifestation.png", evidence),
      Buffer.from(result.imageBase64, "base64"),
    );
    await page.screenshot({
      path: new URL(prefix + "result.png", evidence).pathname,
      fullPage: true,
    });
  } else receipt.error = result.error;
  const tokenResponse = await page.request.post(base + "/api/gemini-token", {
    headers: { "Content-Type": "application/json" },
    data: {},
  });
  const token = await tokenResponse.json();
  receipt.voiceToken = token.ok ? "PASS" : "FAIL";
  receipt.voiceTokenStatus = tokenResponse.status();
  if (!token.ok) receipt.voiceError = token.error;
  if (token.token) {
    receipt.voiceSetup = await new Promise<string>((resolve) => {
      const ws = new WebSocket(
        "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=" +
          encodeURIComponent(token.token),
      );
      let done = false;
      const finish = (s: string) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        ws.close();
        resolve(s);
      };
      const timer = setTimeout(() => finish("BLOCKED: setup timeout"), 15000);
      ws.onopen = () =>
        ws.send(
          JSON.stringify({
            setup: {
              model: "models/gemini-3.5-transcribe-live",
              generationConfig: { responseModalities: ["TEXT"] },
              realtimeInputConfig: {
                automaticActivityDetection: { disabled: true },
              },
              inputAudioTranscription: { languageCodes: [], mode: "SMART" },
            },
          }),
        );
      ws.onmessage = async (e) => {
        const m = JSON.parse(
          typeof e.data === "string" ? e.data : await e.data.text(),
        );
        if (m.setupComplete) finish("PASS");
        else if (m.error) finish("FAIL: " + m.error.message);
      };
      ws.onerror = () => finish("FAIL: connection error");
      ws.onclose = () => finish("FAIL: connection closed before setup");
    });
  }
} catch (err) {
  receipt.runError = err instanceof Error ? err.message : "Unexpected error";
} finally {
  await writeFile(
    new URL(prefix + "provider.json", evidence),
    JSON.stringify(receipt, null, 2),
  );
  console.log(JSON.stringify(receipt, null, 2));
  await browser.close();
}
