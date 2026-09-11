import { test, expect } from "vitest";
import express from "express";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { backupRouter } from "../server/backup";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const image = "data:image/png;base64,aGVsbG8=";
async function serve(root?: string) {
  const app = express();
  app.use(express.json());
  app.use(backupRouter(root));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address() as { port: number };
  return { server, url: `http://127.0.0.1:${address.port}` };
}
test("durable immutable snapshots require complete, hash-verified objects and survive server restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "incant-backup-"));
  let host = await serve(root);
  const put = async (path: string, data: unknown) =>
    fetch(host.url + path, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
  try {
    const snapshot = {
      device: "test-device",
      id: 1,
      sketch: hash(image),
      spell: "test",
      images: [],
    };
    const id = hash(JSON.stringify(snapshot));
    expect((await put("/snapshots/" + id, snapshot)).status).toBe(409);
    expect(
      (await put("/objects/" + hash(image), { data: image + "a" })).status,
    ).toBe(400);
    expect((await put("/objects/" + hash(image), { data: image })).status).toBe(
      200,
    );
    expect((await put("/snapshots/" + id, snapshot)).status).toBe(200);
    expect((await put("/snapshots/" + id, snapshot)).status).toBe(200);
    const second = { ...snapshot, spell: "second" };
    expect(
      (await put("/snapshots/" + hash(JSON.stringify(second)), second)).status,
    ).toBe(200);
    await new Promise<void>((r) => host.server.close(() => r()));
    host = await serve(root);
    expect(
      await (await fetch(host.url + "/objects/" + hash(image))).json(),
    ).toEqual({ data: image });
    const records = await (await fetch(host.url + "/snapshots")).json();
    expect(records).toHaveLength(2);
    expect(records.map((r: any) => r.spell).sort()).toEqual(["second", "test"]);
    expect((await put("/objects/invalid", { data: image })).status).toBe(400);
  } finally {
    await new Promise<void>((r) => host.server.close(() => r()));
    await rm(root, { recursive: true, force: true });
  }
});
test("missing durable storage fails closed", async () => {
  const host = await serve();
  try {
    expect((await fetch(host.url + "/status")).status).toBe(503);
  } finally {
    host.server.close();
  }
});
