import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { conversationConfig } from "../server/realtime";
process.loadEnvFile(".env");
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
});
const page = await browser.newPage();
try {
  await page.route("**/api/realtime-token", async (r) => {
    const response = await fetch(
      "https://api.openai.com/v1/realtime/client_secrets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ session: conversationConfig }),
      },
    );
    const b = await response.json();
    await r.fulfill({
      status: response.status,
      json: { value: b.value, error: b.error?.message },
    });
  });
  await page.addInitScript("window.__name = (value) => value");
  await page.goto("http://127.0.0.1:5173");
  const result = await page.evaluate(async () => {
    const { RealtimeVoice } = await import(
      "/src/lib/realtime-voice.ts" as string
    );
    const context = new AudioContext(),
      stream = context.createMediaStreamDestination().stream;
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => stream,
    });
    const Native = RTCPeerConnection;
    let channel: RTCDataChannel;
    let audioTrack = false;
    let spoken = false;
    (window as any).RTCPeerConnection = class extends Native {
      constructor() {
        super();
        this.addEventListener("track", () => (audioTrack = true));
      }
      createDataChannel(
        ...args: Parameters<RTCPeerConnection["createDataChannel"]>
      ) {
        channel = super.createDataChannel(...args);
        channel.addEventListener("message", (e) => {
          const m = JSON.parse(e.data);
          if (m.type === "response.output_audio_transcript.done") spoken = true;
        });
        return channel;
      }
    };
    let error = "";
    let cast = "";
    const voice = new RealtimeVoice(
      () => {},
      (s: string) => (cast = s),
      (e: Error) => (error = e.message),
    );
    await voice.connect("", null);
    channel!.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: "My sketch is a small cottage beneath a crescent moon. I want warm ink illustration. Please acknowledge in one short sentence; do not cast yet.",
            },
          ],
        },
      }),
    );
    channel!.send(JSON.stringify({ type: "response.create" }));
    for (let i = 0; i < 120 && !spoken && !error; i++)
      await new Promise((r) => setTimeout(r, 100));
    voice.finish();
    for (let i = 0; i < 180 && !cast && !error; i++)
      await new Promise((r) => setTimeout(r, 100));
    voice.close();
    await context.close();
    return {
      audioTrack,
      spoken,
      cast,
      error,
      tracksStopped: stream.getTracks().every((t) => t.readyState === "ended"),
    };
  });
  const receipt = {
    date: new Date().toISOString(),
    source:
      "Live OpenAI WebRTC; synthetic text description and silent microphone; no physical DC-1 audio tested",
    ...result,
    status:
      result.audioTrack &&
      result.spoken &&
      result.cast &&
      !result.error &&
      result.tracksStopped
        ? "PASS"
        : "FAIL",
  };
  await writeFile(
    "../docs/evidence/realtime-live.json",
    JSON.stringify(receipt, null, 2),
  );
  console.log(receipt);
  if (receipt.status !== "PASS") process.exitCode = 1;
} finally {
  await browser.close();
}
