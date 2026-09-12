const WS_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
const WS_CONSTRAINED =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";

const MODEL = "models/gemini-3.5-transcribe-live";

type TranscriptHandler = (text: string, final: boolean) => void;

function liveUrl(credential: string): string {
  const cred = credential.trim();
  if (cred.startsWith("auth_tokens/")) {
    return `${WS_CONSTRAINED}?access_token=${encodeURIComponent(cred)}`;
  }
  return `${WS_URL}?key=${encodeURIComponent(cred)}`;
}

async function decodeWsData(data: unknown): Promise<string> {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(data);
  }
  if (typeof Blob !== "undefined" && data instanceof Blob) return data.text();
  return String(data ?? "");
}

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
  private setupResolve: (() => void) | null = null;
  private setupReject: ((err: Error) => void) | null = null;
  private setupTimer = 0;
  private lastTranscript = 0;
  private turnComplete = false;

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN && this.setupDone;
  }

  async connect(
    apiKey: string,
    onTranscript?: TranscriptHandler,
  ): Promise<void> {
    this.onTranscript = onTranscript ?? null;
    if (this.connected) return;

    this.disconnect();

    await new Promise<void>((resolve, reject) => {
      const url = liveUrl(apiKey);
      const ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";
      this.ws = ws;
      this.ready = false;
      this.setupDone = false;
      this.setupResolve = resolve;
      this.setupReject = reject;

      this.setupTimer = window.setTimeout(() => {
        this.setupReject?.(
          new Error("The transcribe circle did not open in time."),
        );
        this.setupReject = null;
        this.setupResolve = null;
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
      };

      ws.onerror = () => {
        window.clearTimeout(this.setupTimer);
        this.setupReject?.(
          new Error("Could not reach Gemini Live Transcribe."),
        );
        this.setupReject = null;
        this.setupResolve = null;
      };

      ws.onclose = () => {
        window.clearTimeout(this.setupTimer);
        this.setupReject?.(
          new Error("The listening connection closed. Try again."),
        );
        this.setupReject = null;
        this.setupResolve = null;
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
    this.turnComplete = false;
    this.lastTranscript = 0;
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

  async endTurn(waitMs = 8000): Promise<string> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.turnActive = false;
      return this.combined();
    }
    this.ws.send(JSON.stringify({ realtimeInput: { activityEnd: {} } }));
    this.turnActive = false;

    const started = Date.now();
    while (Date.now() - started < waitMs) {
      const elapsed = Date.now() - started;
      if (
        this.combined() &&
        (this.turnComplete ||
          (this.lastTranscript >= started &&
            !this.interim &&
            Date.now() - this.lastTranscript > 500) ||
          (elapsed >= 2500 && this.lastTranscript < started))
      )
        break;
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) break;
      await new Promise((r) => setTimeout(r, 80));
    }
    return this.combined();
  }

  disconnect() {
    window.clearTimeout(this.setupTimer);
    this.setupReject?.(new Error("Listening cancelled."));
    this.setupReject = null;
    this.setupResolve = null;
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
    return [finalText, this.interim].filter(Boolean).join(" ").trim();
  }

  private async handleMessage(data: unknown) {
    const text = await decodeWsData(data);

    let msg: {
      setupComplete?: unknown;
      serverContent?: {
        turnComplete?: boolean;
        interimInputTranscription?: { text?: string };
        inputTranscription?: { text?: string };
      };
    };
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }

    if (msg.setupComplete && !this.setupDone) {
      this.setupDone = true;
      this.ready = true;
      window.clearTimeout(this.setupTimer);
      this.setupResolve?.();
      this.setupResolve = null;
      this.setupReject = null;
    }

    const content = msg.serverContent;
    if (!content) return;
    if (content.turnComplete) this.turnComplete = true;

    if (content.interimInputTranscription?.text) {
      this.lastTranscript = Date.now();
      this.interim = content.interimInputTranscription.text;
      this.onTranscript?.(this.preview(), false);
    }
    if (content.inputTranscription?.text) {
      this.lastTranscript = Date.now();
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
