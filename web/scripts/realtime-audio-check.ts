import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
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
  const pcm = (await readFile("/private/tmp/incant-voice.pcm")).toString("base64");
  const result = await page.evaluate(async (pcm) => {
    const { RealtimeVoice } = await import(
      "/src/lib/realtime-voice.ts" as string
    );
    const context = new AudioContext(),
      dest = context.createMediaStreamDestination(), stream = dest.stream;
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
    let cast = ""; let transcript = "";
    const voice = new RealtimeVoice(
      (s: string) => { transcript = s; },
      (s: string) => (cast = s),
      (e: Error) => (error = e.message),
    );
    const sketch=document.createElement('canvas');sketch.width=160;sketch.height=160;const ink=sketch.getContext('2d')!;ink.fillStyle='white';ink.fillRect(0,0,160,160);ink.strokeRect(50,80,60,60);ink.beginPath();ink.moveTo(40,80);ink.lineTo(80,40);ink.lineTo(120,80);ink.stroke();
    await voice.connect("", sketch.toDataURL());
    await context.resume();const raw=atob(pcm),buffer=context.createBuffer(1,raw.length/2,16000),samples=buffer.getChannelData(0);
    for(let i=0;i<samples.length;i++){let n=raw.charCodeAt(i*2)|(raw.charCodeAt(i*2+1)<<8);if(n>32767)n-=65536;samples[i]=n/32768;}
    const source=context.createBufferSource();source.buffer=buffer;source.connect(dest);source.start();
    for(let i=0;i<200&&(!spoken||!transcript)&&!error;i++)await new Promise(r=>setTimeout(r,100));
    voice.finish();
    for (let i = 0; i < 180 && !cast && !error; i++)
      await new Promise((r) => setTimeout(r, 100));
    voice.close();
    await context.close();
    return {
      transcript,
      audioTrack,
      spoken,
      cast,
      error,
      tracksStopped: stream.getTracks().every((t) => t.readyState === "ended"),
    };
  },pcm);
  const receipt = {
    date: new Date().toISOString(),
    source:
      "Live OpenAI WebRTC; synthetic cottage sketch and synthesized speech streamed as microphone audio; no physical DC-1 audio tested",
    ...result,
    status:
      result.transcript.toLowerCase().includes("cottage") && result.audioTrack &&
      result.spoken &&
      result.cast &&
      !result.error &&
      result.tracksStopped
        ? "PASS"
        : "FAIL",
  };
  await writeFile(
    "../docs/evidence/realtime-live-audio.json",
    JSON.stringify(receipt, null, 2),
  );
  console.log(receipt);
  if (receipt.status !== "PASS") process.exitCode = 1;
} finally {
  await browser.close();
}
