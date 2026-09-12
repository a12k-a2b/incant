import { test, expect } from "vitest";
import express from "express";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { owlRouters } from "../server/owl";
const image =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR4nGPYt7T2PwgzpATo/gdhAFwuCX92OUWiAAAAAElFTkSuQmCC";
async function serve(root?: string) {
  const app = express();
  app.use(express.json());
  const owl = owlRouters(root);
  app.use("/public", owl.publicRouter);
  app.use(
    "/private",
    (q, s, n) =>
      q.get("authorization") === "test-room" ? n() : s.sendStatus(401),
    owl.privateRouter,
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = "http://127.0.0.1:" + (server.address() as any).port;
  return {
    server,
    request: (path: string, body?: unknown, key?: string) =>
      fetch(base + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "content-type": "application/json",
          ...(path.startsWith("/private")
            ? { authorization: "test-room" }
            : {}),
          ...(key ? { "x-owl-key": key } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    base,
  };
}
test("owl capabilities isolate images; open and reply receipts are durable and retry-safe", async () => {
  const root = await mkdtemp(join(tmpdir(), "owl-test-"));
  let host = await serve(root);
  try {
    const id = randomUUID();
    const created = await host.request("/private", { id, image });
    expect(created.status).toBe(201);
    const letter = await created.json();
    expect(
      (await (await host.request("/private", { id, image })).json()).token,
    ).toBe(letter.token);
    const second = await (
      await host.request("/private", { id: randomUUID(), image })
    ).json();
    expect(second.token).not.toBe(letter.token);
    expect((await fetch(host.base + "/private")).status).toBe(401);
    expect((await host.request("/public")).status).toBe(404);
    expect(
      (
        await host.request(
          "/public",
          undefined,
          second.id + "." + letter.token.split(".")[1],
        )
      ).status,
    ).toBe(404);
    expect(
      (await host.request("/public", undefined, letter.token)).status,
    ).toBe(200);
    expect(
      (await host.request("/public/image", undefined, letter.token)).status,
    ).toBe(409);
    let rows = await (await host.request("/private")).json();
    expect(rows.find((r: any) => r.id === id).opened).toBeUndefined();
    const replyId = randomUUID();
    expect(
      (
        await host.request(
          "/public/reply",
          { id: replyId, image },
          letter.token,
        )
      ).status,
    ).toBe(404);
    await Promise.all([
      host.request("/public/open", {}, letter.token),
      host.request("/public/open", {}, letter.token),
    ]);
    expect(
      (
        await host.request("/public/image", undefined, letter.token)
      ).headers.get("cache-control"),
    ).toBe("no-store");
    const attempts = await Promise.all([
      host.request("/public/reply", { id: replyId, image }, letter.token),
      host.request("/public/reply", { id: replyId, image }, letter.token),
    ]);
    expect(attempts.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(
      (
        await host.request(
          "/public/reply",
          { id: randomUUID(), image: "data:image/svg+xml;base64,PHN2Zz4=" },
          letter.token,
        )
      ).status,
    ).toBe(400);
    await new Promise<void>((r) => host.server.close(() => r()));
    host = await serve(root);
    rows = await (await host.request("/private")).json();
    expect(rows.find((r: any) => r.id === id).replies).toHaveLength(1);
    expect(rows.find((r: any) => r.id === id).opened).toBeGreaterThan(0);
    expect(rows.find((r: any) => r.id === second.id).opened).toBeUndefined();
    expect(rows.find((r: any) => r.id === id).handedOff).toBeUndefined();
    await host.request("/private/" + id + "/handoff", {});
    expect(
      (await (await host.request("/private")).json()).find(
        (r: any) => r.id === id,
      ).handedOff,
    ).toBeGreaterThan(0);
    await host.request("/private/" + id + "/revoke", {});
    expect(
      (await host.request("/public/image", undefined, letter.token)).status,
    ).toBe(404);
    expect(
      (
        await host.request(
          "/public/reply",
          { id: randomUUID(), image },
          letter.token,
        )
      ).status,
    ).toBe(404);
    expect(
      (await host.request("/private/" + id + "/replies/" + replyId)).status,
    ).toBe(200);
    const file = join(root, second.id, "letter.json"),
      record = JSON.parse(await readFile(file, "utf8"));
    record.expires = Date.now() - 1;
    await writeFile(file, JSON.stringify(record));
    expect(
      (await host.request("/public", undefined, second.token)).status,
    ).toBe(404);
  } finally {
    await new Promise<void>((r) => host.server.close(() => r()));
    await rm(root, { recursive: true, force: true });
  }
});
test("owl storage fails closed when unconfigured", async () => {
  const h = await serve();
  try {
    expect((await h.request("/private")).status).toBe(503);
    expect((await h.request("/public")).status).toBe(503);
  } finally {
    h.server.close();
  }
});
test("parcel persists exact source and spell; retries cannot substitute another prompt", async () => {
  const root = await mkdtemp(join(tmpdir(), "owl-parcel-"));
  const h = await serve(root);
  try {
    const id = randomUUID(),
      spell = "A tiny cottage in winter";
    const body = { id, image, sketch: image, spell };
    const letter = await (await h.request("/private", body)).json();
    expect(
      (await h.request("/public/sketch", undefined, letter.token)).status,
    ).not.toBe(200);
    expect(
      (await h.request("/private", { ...body, spell: "A different idea" }))
        .status,
    ).toBe(409);
    const opened = await (
      await h.request("/public/open", {}, letter.token)
    ).json();
    expect(opened).toMatchObject({ spell, hasSketch: true });
    const source = await h.request("/public/sketch", undefined, letter.token);
    expect(source.status).toBe(200);
    expect(Buffer.from(await source.arrayBuffer()).toString("base64")).toBe(
      image.split(",")[1],
    );
    await h.request("/private/" + id + "/revoke", {});
    expect(
      (await h.request("/public/sketch", undefined, letter.token)).status,
    ).toBe(404);
  } finally {
    await new Promise<void>((r) => h.server.close(() => r()));
    await rm(root, { recursive: true, force: true });
  }
});
