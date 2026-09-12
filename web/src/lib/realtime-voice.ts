export class RealtimeVoice {
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private audio: HTMLAudioElement;
  private stream: MediaStream | null = null;
  private controller = new AbortController();
  private closed = false;
  private committed = false;
  private finalizeTimer = 0;
  private timeout = 0;
  constructor(
    private onWords: (s: string) => void,
    private onCast: (s: string) => void,
    private onError: (e: Error) => void,
  ) {
    this.audio = new Audio();
    this.audio.autoplay = true;
  }
  async connect(key: string, sketch: string | null) {
    try {
      void this.audio.play().catch(() => {});
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (this.closed) {
        this.stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const pc = (this.pc = new RTCPeerConnection());
      pc.ontrack = (e) => {
        this.audio.srcObject = e.streams[0];
        void this.audio
          .play()
          .catch(() =>
            this.onError(new Error("Tap the wand again to enable its voice.")),
          );
      };
      pc.onconnectionstatechange = () => {
        if (
          !this.closed &&
          ["failed", "disconnected"].includes(pc.connectionState)
        )
          this.fail(
            "The talking wand lost its connection. Your sketch is safe.",
          );
      };
      this.stream.getTracks().forEach((t) => pc.addTrack(t, this.stream!));
      const dc = (this.channel = pc.createDataChannel("oai-events"));
      const ready = new Promise<void>((resolve, reject) => {
        this.timeout = window.setTimeout(
          () => reject(new Error("The talking wand did not connect in time.")),
          20000,
        );
        dc.onopen = () => {
          clearTimeout(this.timeout);
          if (sketch)
            dc.send(
              JSON.stringify({
                type: "conversation.item.create",
                item: {
                  type: "message",
                  role: "user",
                  content: [
                    {
                      type: "input_text",
                      text: "Here is my sketch. Wait for my spoken description.",
                    },
                    { type: "input_image", image_url: sketch },
                  ],
                },
              }),
            );
          resolve();
        };
        dc.onclose = () => {
          if (!this.closed) this.fail("The talking wand connection closed.");
        };
        dc.onmessage = (e) => {
          if (this.closed) return;
          try {
            const m = JSON.parse(e.data);
            if (
              m.type === "conversation.item.input_audio_transcription.completed"
            )
              this.onWords(m.transcript || "");
            if (m.type === "response.done") {
              for (const item of m.response?.output || []) {
                if (
                  item.type === "function_call" &&
                  item.name === "cast_spell" &&
                  !this.committed
                ) {
                  const data = JSON.parse(item.arguments);
                  if (
                    typeof data.spell !== "string" ||
                    !data.spell.trim() ||
                    data.spell.length > 4000
                  )
                    throw new Error("Please describe the spell again.");
                  this.committed = true;
                  clearTimeout(this.finalizeTimer);
                  this.onCast(data.spell.trim());
                }
              }
            }
            if (
              m.type === "error" &&
              ![
                "response_cancel_not_active",
                "input_audio_buffer_commit_empty",
              ].includes(m.error?.code)
            )
              this.fail(
                m.error?.message || "The talking wand could not finish.",
              );
          } catch {
            this.fail("The talking wand returned an unreadable spell.");
          }
        };
      });
      // Attach rejection immediately while token/SDP requests are pending.
      void ready.catch(() => {});
      const tokenResponse = await fetch("/api/realtime-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openaiKey: key }),
        signal: AbortSignal.any([
          this.controller.signal,
          AbortSignal.timeout(15000),
        ]),
      });
      const token = await tokenResponse.json();
      if (!tokenResponse.ok || !token.value)
        throw new Error(token.error || "The talking wand is unavailable.");
      if (this.closed) return;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const r = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.value}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
        signal: AbortSignal.any([
          this.controller.signal,
          AbortSignal.timeout(15000),
        ]),
      });
      if (!r.ok)
        throw new Error(
          "The talking wand could not open its audio connection.",
        );
      await pc.setRemoteDescription({ type: "answer", sdp: await r.text() });
      await ready;
    } catch (e) {
      this.close();
      throw e;
    }
  }
  finish() {
    if (this.closed || this.committed) return;
    this.stream?.getTracks().forEach((t) => (t.enabled = false));
    this.send({ type: "response.cancel" });
    this.send({ type: "input_audio_buffer.commit" });
    this.send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Cast now using my spoken description. Call cast_spell with the complete agreed image description.",
          },
        ],
      },
    });
    this.send({
      type: "response.create",
      response: { tool_choice: { type: "function", name: "cast_spell" } },
    });
    this.finalizeTimer = window.setTimeout(
      () =>
        this.fail(
          "The talking wand took too long to finish. Your sketch is safe; try dictation.",
        ),
      15000,
    );
  }
  private send(m: unknown) {
    if (this.channel?.readyState === "open")
      this.channel.send(JSON.stringify(m));
  }
  private fail(message: string) {
    if (this.closed) return;
    this.onError(new Error(message));
    this.close();
  }
  close() {
    this.closed = true;
    clearTimeout(this.timeout);
    clearTimeout(this.finalizeTimer);
    this.controller.abort();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.audio.pause();
    this.audio.srcObject = null;
    this.channel?.close();
    this.pc?.close();
  }
}
