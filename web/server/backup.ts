import express from "express";
import { mkdir, open, readFile, readdir, rename } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const valid = (s: unknown): s is string =>
  typeof s === "string" && /^[a-f0-9]{64}$/.test(s);
export function backupRouter(root?: string) {
  const router = express.Router();
  router.use((_req, res, next) => {
    if (!root) {
      res.status(503).json({ error: "Cloud backup is not configured." });
      return;
    }
    next();
  });
  async function write(kind: string, id: string, data: string) {
    const dir = join(root!, kind);
    await mkdir(dir, { recursive: true });
    const temp = join(dir, `.${randomUUID()}`),
      file = await open(temp, "wx", 0o600);
    try {
      await file.writeFile(data);
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temp, join(dir, id));
    const directory = await open(dir, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }
  router.get("/status", async (_req, res) => {
    await mkdir(join(root!, "snapshots"), { recursive: true });
    await mkdir(join(root!, "objects"), { recursive: true });
    res.json({
      ok: true,
      snapshots: (await readdir(join(root!, "snapshots"))).filter(valid),
      objects: (await readdir(join(root!, "objects"))).filter(valid),
    });
  });
  router.put("/objects/:id", async (req, res) => {
    const { id } = req.params,
      data = req.body?.data;
    if (
      !valid(id) ||
      typeof data !== "string" ||
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(data) ||
      hash(data) !== id
    ) {
      res.status(400).json({ error: "Invalid backup image." });
      return;
    }
    await write("objects", id, data);
    res.json({ ok: true });
  });
  router.get("/objects/:id", async (req, res) => {
    if (!valid(req.params.id)) {
      res.sendStatus(400);
      return;
    }
    try {
      res.json({
        data: await readFile(join(root!, "objects", req.params.id), "utf8"),
      });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") res.sendStatus(404);
      else throw e;
    }
  });
  router.put("/snapshots/:id", async (req, res) => {
    const text = JSON.stringify(req.body),
      p = req.body;
    if (
      !valid(req.params.id) ||
      hash(text) !== req.params.id ||
      text.length > 1000000 ||
      typeof p.device !== "string" ||
      !/^[a-zA-Z0-9-]{1,80}$/.test(p.device) ||
      !Number.isSafeInteger(p.id) ||
      !valid(p.sketch) ||
      !Array.isArray(p.images) ||
      p.images.length > 1000 ||
      p.images.some(
        (i: any) =>
          !valid(i.image) ||
          typeof i.id !== "string" ||
          typeof i.spell !== "string",
      )
    ) {
      res.status(400).json({ error: "Invalid backup manifest." });
      return;
    }
    // A manifest is acknowledged only after every referenced image is durable.
    for (const id of [p.sketch, ...p.images.map((i: any) => i.image)]) {
      try {
        await readFile(join(root!, "objects", id));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") {
          res.status(409).json({ error: "Image upload incomplete." });
          return;
        }
        throw e;
      }
    }
    await write("snapshots", req.params.id, text);
    res.json({ ok: true });
  });
  router.get("/snapshots", async (_req, res) => {
    await mkdir(join(root!, "snapshots"), { recursive: true });
    const ids = (await readdir(join(root!, "snapshots"))).filter(valid);
    res.json(
      await Promise.all(
        ids.map(async (id) => ({
          key: id,
          ...JSON.parse(await readFile(join(root!, "snapshots", id), "utf8")),
        })),
      ),
    );
  });
  return router;
}
