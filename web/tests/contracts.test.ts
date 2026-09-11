import { describe, it, expect, vi, afterEach } from "vitest";
import { validDrawing, hasInk } from "../src/lib/drawing";
import { requestCast } from "../src/lib/cast-client";
import { DEFAULT_SETTINGS } from "../src/lib/settings";
import { editSketchToImage } from "../src/lib/openai-images.server";
afterEach(() => vi.unstubAllGlobals());
describe("drawing validity", () => {
  it("rejects corrupt coordinates and accepts ink", () => {
    expect(
      validDrawing([{ eraser: false, points: [{ x: NaN, y: 0, p: 1 }] }]),
    ).toBe(false);
    expect(
      validDrawing([{ eraser: false, points: [{ x: 2, y: 0, p: 1 }] }]),
    ).toBe(false);
    expect(validDrawing([])).toBe(true);
    expect(hasInk([{ eraser: true, points: [{ x: 0, y: 0, p: 1 }] }])).toBe(
      false,
    );
  });
});
it("network rejection settles instead of hanging", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  await expect(
    requestCast(
      "x",
      "words",
      DEFAULT_SETTINGS,
      0,
      new AbortController().signal,
    ),
  ).rejects.toThrow("offline");
});
it("malformed provider response does not become an image", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("not json", { status: 502 })),
  );
  await expect(
    requestCast(
      "x",
      "words",
      DEFAULT_SETTINGS,
      0,
      new AbortController().signal,
    ),
  ).rejects.toThrow();
});
it("invalid PNG never leaves the app server", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const result = await editSketchToImage({
    ...DEFAULT_SETTINGS,
    openaiKey: "synthetic",
    sketchPngBase64: Buffer.alloc(80).toString("base64"),
    incantation: "test",
  });
  expect(result.ok).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
});
import { createAccess, equalSecret } from "../src/lib/access.server";
it("access tokens reject absence, tampering, and a different room key", () => {
  const a = createAccess("synthetic-room-key"),
    token = a.issue();
  expect(a.valid("")).toBe(false);
  expect(a.valid("incant_session=" + token)).toBe(true);
  expect(a.valid("incant_session=" + token + "x")).toBe(false);
  expect(createAccess("other-key").valid("incant_session=" + token)).toBe(
    false,
  );
  expect(equalSecret("abc", "ab")).toBe(false);
});
