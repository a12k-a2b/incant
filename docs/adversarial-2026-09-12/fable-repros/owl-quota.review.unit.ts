import { test, expect } from "vitest";
import express from "express";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { owlRouters } from "../server/owl";
const image =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR4nGPYt7T2PwgzpATo/gdhAFwuCX92OUWiAAAAAElFTkSuQmCC";
test("thirty letters in a day lock the owl; revoked and expired letters still count", async () => {
  const root = await mkdtemp(join(tmpdir(), "owl-quota-"));
  const app = express();
  app.use(express.json());
  const owl = owlRouters(root);
  app.use("/private", owl.privateRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = "http://127.0.0.1:" + (server.address() as any).port;
  const post = (path: string, body: unknown) =>
    fetch(base + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  try {
    const ids: string[] = [];
    for (let i = 0; i < 30; i++) {
      const id = randomUUID();
      ids.push(id);
      expect((await post("/private", { id, image })).status).toBe(201);
    }
    // Revoke all of them: the owner "closed the link" on every letter.
    for (const id of ids) expect((await post(`/private/${id}/revoke`, {})).status).toBe(200);
    const blocked = await post("/private", { id: randomUUID(), image });
    console.log("31st letter after revoking all 30:", blocked.status, await blocked.text());
    console.log("letter directories on disk after revoke:", (await readdir(root)).length);
    expect(blocked.status).toBe(429);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    await rm(root, { recursive: true, force: true });
  }
});
