import { test, expect } from "vitest";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createAccess } from "../src/lib/access.server";

test("password-free entry isolates browser backups and owl mail while preserving the legacy room", async () => {
  const dir = await mkdtemp(join(tmpdir(), "incant-public-test-"));
  const socket = createServer();
  await new Promise<void>((r) => socket.listen(0, "127.0.0.1", r));
  const port = (socket.address() as any).port;
  await new Promise<void>((r) => socket.close(() => r()));
  const child = spawn(process.execPath, ["--import", "tsx", "server.ts"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      HOST: "127.0.0.1",
      PORT: String(port),
      APP_ACCESS_KEY: "synthetic-owner-key",
      INCANT_PRIVATE_ROOM: "false",
      OPENAI_API_KEY: "",
      GEMINI_API_KEY: "",
      RAILWAY_VOLUME_MOUNT_PATH: "",
      INCANT_BACKUP_PATH: join(dir, "backup"),
      INCANT_OWL_PATH: join(dir, "owl"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const base = `http://127.0.0.1:${port}`;
  const req = (path: string, cookie = "", method = "GET", body?: unknown) =>
    fetch(base + path, {
      method,
      headers: { cookie, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Test server did not start")),
        15000,
      );
      child.stdout.on("data", (chunk) => {
        if (String(chunk).includes("Incant:")) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`Server exited ${code}`));
      });
    });
    expect((await req("/api/cast", "", "POST", {})).status).toBe(401);
    const openA = await req("/api/session"),
      openB = await req("/api/session");
    const a = openA.headers.get("set-cookie")!.split(";")[0],
      b = openB.headers.get("set-cookie")!.split(";")[0];
    expect(await openA.json()).toMatchObject({ unlocked: true });
    expect(a).not.toBe(b);
    expect((await req("/api/cast", a, "POST", {})).status).toBe(400); // reaches validation, no paid call
    const legacy =
      "incant_session=" + createAccess("synthetic-owner-key").issue();
    const data = "data:image/png;base64,aGVsbG8=",
      id = createHash("sha256").update(data).digest("hex");
    expect(
      (await req(`/api/backup/objects/${id}`, legacy, "PUT", { data })).status,
    ).toBe(200);
    expect((await req(`/api/backup/objects/${id}`, a)).status).toBe(404);
    expect((await req(`/api/backup/objects/${id}`, legacy)).status).toBe(200);
    expect(
      (await req(`/api/backup/objects/${id}`, a, "PUT", { data })).status,
    ).toBe(200);
    expect((await req(`/api/backup/objects/${id}`, b)).status).toBe(404);
    expect((await req(`/api/backup/objects/${id}`, a)).status).toBe(200);
    expect(
      (await req("/api/session", a)).headers.get("set-cookie")!.split(";")[0],
    ).toBe(a);
    const letter = {
      id: randomUUID(),
      image:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR4nGPYt7T2PwgzpATo/gdhAFwuCX92OUWiAAAAAElFTkSuQmCC",
      spell: "Synthetic owl",
    };
    expect((await req("/api/owl", a, "POST", letter)).status).toBe(201);
    expect(await (await req("/api/owl", b)).json()).toEqual([]);
    expect(await (await req("/api/owl", a)).json()).toHaveLength(1);
    expect(
      (await req(`/api/owl/${letter.id}/revoke`, b, "POST", {})).status,
    ).toBe(404);
    expect((await req("/api/owl", b, "POST", letter)).status).toBe(404);
    expect(
      (await req(`/api/owl/${letter.id}/handoff`, a, "POST", {})).status,
    ).toBe(200);
    expect(
      (await req("/api/backup/status", "incant_browser=../../legacy")).status,
    ).toBe(401);
  } finally {
    child.kill();
    if (child.exitCode === null)
      await new Promise<void>((r) => child.once("exit", () => r()));
    await rm(dir, { recursive: true, force: true });
  }
}, 30000);
