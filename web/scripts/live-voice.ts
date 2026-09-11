import { readFile, writeFile } from "node:fs/promises";
const t = await fetch("http://127.0.0.1:5173/api/gemini-token", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{}",
}).then((r) => r.json());
if (!t.token) throw new Error("No voice token");
const pcm = await readFile("/private/tmp/incant-voice.pcm");
let transcript = "";
const result = await new Promise<{ status: string; transcript: string }>(
  (resolve) => {
    const ws = new WebSocket(
      "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=" +
        encodeURIComponent(t.token),
    );
    let done = false;
    const finish = (status: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      ws.close();
      resolve({ status, transcript });
    };
    const timer = setTimeout(
      () => finish(transcript ? "PASS" : "FAIL: no transcription"),
      20000,
    );
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
      if (m.setupComplete) {
        ws.send(JSON.stringify({ realtimeInput: { activityStart: {} } }));
        for (let i = 0; i < pcm.length; i += 3200) {
          if (done) break;
          ws.send(
            JSON.stringify({
              realtimeInput: {
                audio: {
                  data: pcm.subarray(i, i + 3200).toString("base64"),
                  mimeType: "audio/pcm;rate=16000",
                },
              },
            }),
          );
          await new Promise((r) => setTimeout(r, 100));
        }
        if (!done) {
          ws.send(JSON.stringify({ realtimeInput: { activityEnd: {} } }));
          setTimeout(
            () => finish(transcript ? "PASS" : "FAIL: no transcription"),
            4500,
          );
        }
      }
      if (m.serverContent?.inputTranscription?.text)
        transcript += " " + m.serverContent.inputTranscription.text;
      if (m.error) finish("FAIL: provider error");
    };
    ws.onerror = () => finish("FAIL: connection error");
  },
);
const receipt = {
  ...result,
  source: "synthetic macOS speech, streamed as PCM16 at 16kHz",
  expected: "A small stone cottage under the moon, drawn in storybook ink.",
  date: new Date().toISOString(),
};
await writeFile(
  "../docs/evidence/live-voice.json",
  JSON.stringify(receipt, null, 2),
);
console.log(JSON.stringify(receipt));
