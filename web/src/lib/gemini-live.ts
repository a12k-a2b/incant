const WS_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

const MODEL = "models/gemini-3.5-transcribe-live";

type TranscriptHandler = (text: string, final: boolean) => void;

function bytesToBase64(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export class GeminiLiveTranscribe {
  private ws: WebSocket | null = null;
  private ready = false;
  private setupDone = false;
  private onTranscript: TranscriptHandler | null = null;
  private finals: string[] = [];
  private interim = "";
  private turnActive = false;

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN && this.setupDone;
  }

  async connect(apiKey: string, onTranscript?: TranscriptHandler): Promise<void> {
    this.onTranscript = onTranscript ?? null;
    if (this.connected) return;

    this.disconnect();

    await new Promise<void>((resolve, reject) => {
      const url = `${WS_URL}?key=${encodeURIComponent(apiKey.trim())}`;
      const ws = new WebSocket(url);
      this.ws = ws;
      this.ready = false;
      this.setupDone = false;

      const timeout = window.setTimeout(() => {
        reject(new Error("The transcribe circle did not open in time."));
        ws.close();
      }, 12000);

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            setup: {
              model: MODEL,
              generationConfig: { responseModalities: ["TEXT"] },
              realtimeInputConfig: {
                automaticActivityDetection: { disabled: true },
              },
              inputAudioTranscription: {
                languageCodes: [],
                mode: "SMART",
                customVocabulary: [
                  "sketch",
                  "transfigure",
                  "parchment",
                  "watercolor",
                  "oil painting",
                  "photorealistic",
                  "ink",
                  "woodcut",
                  "Daylight",
                ],
              },
            },
          }),
        );
      };

      ws.onmessage = (event) => {
        void this.handleMessage(event.data);
        if (!this.setupDone) {
          try {
            const msg = JSON.parse(String(event.data)) as {
              setupComplete?: unknown;
            };
            if (msg.setupComplete) {
              this.setupDone = true;
              this.ready = true;
              window.clearTimeout(timeout);
              resolve();
            }
          } catch {
            /* ignore parse of non-setup frames */
          }
        }
      };

      ws.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error("Could not reach Gemini Live Transcribe."));
      };

      ws.onclose = () => {
        this.ready = false;
        this.setupDone = false;
        if (this.ws === ws) this.ws = null;
      };
    });
  }

  startTurn() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.finals = [];
    this.interim = "";
    this.turnActive = true;
    this.ws.send(JSON.stringify({ realtimeInput: { activityStart: {} } }));
  }

  sendPcm16(pcm: Int16Array) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.turnActive) {
      return;
    }
    const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    this.ws.send(
      JSON.stringify({
        realtimeInput: {
          audio: {
            data: bytesToBase64(bytes),
            mimeType: "audio/pcm;rate=16000",
          },
        },
      }),
    );
  }

  async endTurn(waitMs = 2500): Promise<string> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.turnActive = false;
      return this.combined();
    }
    this.ws.send(JSON.stringify({ realtimeInput: { activityEnd: {} } }));
    this.turnActive = false;

    const started = Date.now();
    while (Date.now() - started < waitMs) {
      if (this.finals.length > 0 && !this.interim) break;
      await new Promise((r) => setTimeout(r, 80));
    }
    return this.combined();
  }

  disconnect() {
    this.turnActive = false;
    this.ready = false;
    this.setupDone = false;
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
  }

  private combined() {
    const finalText = this.finals.join(" ").trim();
    return (finalText || this.interim).trim();
  }

  private async handleMessage(data: unknown) {
    let text = "";
    if (typeof data === "string") text = data;
    else if (data instanceof Blob) text = await data.text();
    else if (data instanceof ArrayBuffer) {
      text = new TextDecoder().decode(data);
    } else {
      return;
    }

    let msg: {
      setupComplete?: unknown;
      serverContent?: {
        interimInputTranscription?: { text?: string };
        inputTranscription?: { text?: string };
      };
    };
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }

    const content = msg.serverContent;
    if (!content) return;

    if (content.interimInputTranscription?.text) {
      this.interim = content.interimInputTranscription.text;
      this.onTranscript?.(this.preview(), false);
    }
    if (content.inputTranscription?.text) {
      const piece = content.inputTranscription.text.trim();
      if (piece) this.finals.push(piece);
      this.interim = "";
      this.onTranscript?.(this.combined(), true);
    }
  }

  private preview() {
    const head = this.finals.join(" ").trim();
    if (head && this.interim) return `${head} ${this.interim}`;
    return head || this.interim;
  }
}

export function downsampleTo16k(
  input: Float32Array,
  inputRate: number,
): Int16Array {
  if (inputRate === 16000) return floatTo16(input);
  const ratio = inputRate / 16000;
  const outLen = Math.floor(input.length / ratio);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j] ?? 0;
    const avg = end > start ? sum / (end - start) : 0;
    const s = Math.max(-1, Math.min(1, avg));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function floatTo16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i] ?? 0));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}
