import { afterEach, describe, expect, it, vi } from "vitest";
import { RealtimeVoice } from "../src/lib/realtime-voice";
import { GeminiLiveTranscribe } from "../src/lib/gemini-live";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("RealtimeVoice connection lifecycle", () => {
  it("settles and releases every resource when closed after SDP but before data-channel open", async () => {
    const track = { stop: vi.fn(), enabled: true };
    const stream = { getTracks: () => [track] } as unknown as MediaStream;
    const channel = {
      readyState: "connecting",
      send: vi.fn(),
      close: vi.fn(),
      onopen: null as (() => void) | null,
      onclose: null as (() => void) | null,
      onerror: null as (() => void) | null,
      onmessage: null,
    };
    let remoteSet = false;
    const pc = {
      connectionState: "connecting",
      ontrack: null,
      onconnectionstatechange: null,
      addTrack: vi.fn(),
      createDataChannel: vi.fn(() => channel),
      createOffer: vi.fn(async () => ({ type: "offer", sdp: "offer" })),
      setLocalDescription: vi.fn(async () => {}),
      setRemoteDescription: vi.fn(async () => {
        remoteSet = true;
      }),
      close: vi.fn(),
    };
    class AudioStub {
      autoplay = false;
      srcObject: unknown = null;
      play = vi.fn(async () => {});
      pause = vi.fn();
    }
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("Audio", AudioStub);
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn(async () => stream) },
    });
    vi.stubGlobal(
      "RTCPeerConnection",
      vi.fn(() => pc),
    );
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ value: "synthetic-token" }), {
            status: 200,
          }),
        )
        .mockResolvedValueOnce(new Response("answer", { status: 200 })),
    );

    const onCast = vi.fn();
    const voice = new RealtimeVoice(vi.fn(), onCast, vi.fn());
    const connecting = voice.connect("synthetic-key", "synthetic-sketch");
    await vi.waitFor(() => expect(remoteSet).toBe(true));
    voice.close();

    await expect(connecting).rejects.toThrow("cancelled");
    expect(track.stop).toHaveBeenCalled();
    expect(channel.close).toHaveBeenCalled();
    expect(pc.close).toHaveBeenCalled();
    channel.onopen?.();
    (channel.onmessage as unknown as (event: { data: string }) => void)({
      data: JSON.stringify({
        type: "response.done",
        response: {
          output: [
            {
              type: "function_call",
              name: "cast_spell",
              arguments: JSON.stringify({ spell: "stale cast" }),
            },
          ],
        },
      }),
    });
    expect(channel.send).not.toHaveBeenCalled();
    expect(onCast).not.toHaveBeenCalled();
  });
});

describe("GeminiLiveTranscribe connection lifecycle", () => {
  it("ignores late setup and transcript messages from a replaced socket", async () => {
    class SocketStub {
      static OPEN = 1;
      static instances: SocketStub[] = [];
      readyState = 1;
      binaryType = "";
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: (() => void) | null = null;
      send = vi.fn();
      constructor() {
        SocketStub.instances.push(this);
      }
      close() {
        this.readyState = 3;
        this.onclose?.();
      }
    }
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("WebSocket", SocketStub);
    const transcripts = vi.fn();
    const live = new GeminiLiveTranscribe();
    const first = live.connect("first", transcripts);
    void first.catch(() => {});
    const oldSocket = SocketStub.instances[0];
    const second = live.connect("second", transcripts);
    const newSocket = SocketStub.instances[1];

    oldSocket.onmessage?.({
      data: JSON.stringify({
        setupComplete: {},
        serverContent: { inputTranscription: { text: "stale words" } },
      }),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(transcripts).not.toHaveBeenCalled();
    expect(live.connected).toBe(false);

    newSocket.onopen?.();
    newSocket.onmessage?.({ data: JSON.stringify({ setupComplete: {} }) });
    await expect(second).resolves.toBeUndefined();
    expect(live.connected).toBe(true);
    await expect(first).rejects.toThrow("cancelled");
    live.disconnect();
  });
});
