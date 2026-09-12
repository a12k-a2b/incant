import express from "express";
import {
  mkdir,
  readFile,
  readdir,
  open,
  rename,
  statfs,
  unlink,
} from "node:fs/promises";
import { join } from "node:path";
import {
  randomBytes,
  randomUUID,
  createHash,
  timingSafeEqual,
} from "node:crypto";
const uuid = (s: unknown): s is string =>
  typeof s === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(s);
const hash = (s: string | Buffer) =>
  createHash("sha256").update(s).digest("hex");
type Letter = {
  id: string;
  key: string;
  created: number;
  expires: number;
  revoked: boolean;
  imageHash: string;
  sketchHash?: string;
  spell?: string;
  handedOff?: number;
  opened?: number;
  replies: { id: string; created: number; hash: string }[];
};
function png(data: unknown) {
  if (
    typeof data !== "string" ||
    !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data)
  )
    throw new Error("Use a PNG image.");
  const b = Buffer.from(data.split(",")[1], "base64");
  if (
    b.length < 33 ||
    b.length > 6 * 1024 * 1024 ||
    b.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
    b.toString("ascii", 12, 16) !== "IHDR" ||
    b.readUInt32BE(16) < 1 ||
    b.readUInt32BE(20) < 1 ||
    b.readUInt32BE(16) > 2048 ||
    b.readUInt32BE(20) > 2048
  )
    throw new Error("This image is too large or unreadable.");
  return b;
}
export function owlRouters(root?: string) {
  const privateRouter = express.Router(),
    publicRouter = express.Router();
  const queue = new Map<string, Promise<unknown>>();
  async function serial<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const prior = queue.get(id) || Promise.resolve();
    const next = prior.catch(() => {}).then(fn);
    queue.set(id, next);
    try {
      return await next;
    } finally {
      if (queue.get(id) === next) queue.delete(id);
    }
  }
  const path = (id: string, name = "letter.json") => join(root!, id, name);
  async function atomic(id: string, name: string, data: string | Buffer) {
    await mkdir(join(root!, id), { recursive: true });
    const space = await statfs(root!);
    if (
      space.bavail * space.bsize <
      128 * 1024 * 1024 + Buffer.byteLength(data)
    )
      throw new Error("Owl storage is full; your existing creations are safe.");
    const temp = path(id, "." + randomUUID());
    try {
      const f = await open(temp, "wx", 0o600);
      try {
        await f.writeFile(data);
        await f.sync();
      } finally {
        await f.close();
      }
      await rename(temp, path(id, name));
    } catch (error) {
      await unlink(temp).catch(() => {});
      throw error;
    }
    const d = await open(join(root!, id), "r");
    try {
      await d.sync();
    } finally {
      await d.close();
    }
    const parent = await open(root!, "r");
    try {
      await parent.sync();
    } finally {
      await parent.close();
    }
  }
  async function read(id: string): Promise<Letter> {
    return JSON.parse(await readFile(path(id), "utf8"));
  }
  const save = (r: Letter) => atomic(r.id, "letter.json", JSON.stringify(r));
  const view = (r: Letter) => ({
    id: r.id,
    created: r.created,
    expires: r.expires,
    revoked: r.revoked,
    handedOff: r.handedOff,
    opened: r.opened,
    replies: r.replies.map(({ id, created }) => ({ id, created })),
    token: r.id + "." + r.key,
    spell: r.spell,
    hasSketch: !!r.sketchHash,
  });
  for (const router of [privateRouter, publicRouter])
    router.use((_q, s, n) => {
      s.set({
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      });
      if (!root) {
        s.status(503).json({
          error: "Owl post needs cloud storage. Your image is safe.",
        });
        return;
      }
      n();
    });
  privateRouter.get("/", async (_q, s) => {
    await mkdir(root!, { recursive: true });
    const ids = (await readdir(root!)).filter(uuid);
    const records = await Promise.all(
      ids.map((id) => read(id).catch(() => null)),
    );
    s.json(
      records
        .filter((r): r is Letter => !!r)
        .sort((a, b) => b.created - a.created)
        .map(view),
    );
  });
  privateRouter.post("/", async (q, s) => {
    if (!uuid(q.body?.id)) {
      s.status(400).json({ error: "Invalid letter." });
      return;
    }
    let image: Buffer;
    let sketch: Buffer | undefined;
    if (
      q.body.spell !== undefined &&
      (typeof q.body.spell !== "string" || q.body.spell.length > 4000)
    ) {
      s.status(400).json({ error: "The spell is too long." });
      return;
    }
    try {
      image = png(q.body.image);
      if (q.body.sketch) sketch = png(q.body.sketch);
    } catch (e) {
      s.status(400).json({ error: (e as Error).message });
      return;
    }
    await serial("create", async () => {
      const id = q.body.id;
      let existing: Letter | undefined;
      try {
        existing = await read(id);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
      if (existing) {
        if (
          existing.imageHash !== hash(image) ||
          existing.sketchHash !== (sketch ? hash(sketch) : undefined) ||
          (existing.spell || "") !== (q.body.spell || "")
        ) {
          s.status(409).json({
            error: "This letter already holds another image.",
          });
          return;
        }
        s.json(view(existing));
        return;
      }
      await mkdir(root!, { recursive: true });
      const ids = (await readdir(root!)).filter(uuid);
      const recent = await Promise.all(
        ids.map((id) => read(id).catch(() => null)),
      );
      if (
        recent.filter((r) => r && r.created > Date.now() - 86400000).length >=
          30 ||
        ids.length >= 1000
      ) {
        s.status(429).json({
          error: "The owl has carried many letters. Please try another day.",
        });
        return;
      }
      const r: Letter = {
        id,
        key: randomBytes(32).toString("hex"),
        created: Date.now(),
        expires: Date.now() + 30 * 86400000,
        revoked: false,
        imageHash: hash(image),
        sketchHash: sketch ? hash(sketch) : undefined,
        spell: q.body.spell || "",
        replies: [],
      };
      await atomic(id, "image.png", image);
      if (sketch) await atomic(id, "sketch.png", sketch);
      await save(r);
      s.status(201).json(view(r));
    });
  });
  privateRouter.post("/:id/:action", async (q, s) => {
    if (
      !uuid(q.params.id) ||
      !["handoff", "revoke"].includes(q.params.action)
    ) {
      s.sendStatus(404);
      return;
    }
    await serial(q.params.id, async () => {
      let r: Letter;
      try {
        r = await read(q.params.id);
      } catch {
        s.sendStatus(404);
        return;
      }
      if (q.params.action === "revoke") r.revoked = true;
      else r.handedOff ??= Date.now();
      await save(r);
      s.json(view(r));
    });
  });
  privateRouter.get("/:id/replies/:reply", async (q, s) => {
    if (!uuid(q.params.id) || !uuid(q.params.reply)) {
      s.sendStatus(404);
      return;
    }
    try {
      const r = await read(q.params.id);
      if (!r.replies.some((x) => x.id === q.params.reply)) throw new Error();
      s.type("png").send(
        await readFile(path(r.id, `reply-${q.params.reply}.png`)),
      );
    } catch {
      s.sendStatus(404);
    }
  });
  publicRouter.use(async (q, s, n) => {
    const token = q.get("x-owl-key") || "",
      parts = token.split(".");
    if (!uuid(parts[0]) || !/^[a-f0-9]{64}$/.test(parts[1] || "")) {
      s.status(404).json({ error: "This owl letter is unavailable." });
      return;
    }
    try {
      const r = await read(parts[0]);
      if (
        !timingSafeEqual(
          Buffer.from(hash(parts[1])),
          Buffer.from(hash(r.key)),
        ) ||
        r.revoked ||
        r.expires < Date.now()
      )
        throw new Error();
      s.locals.letter = r;
      n();
    } catch {
      s.status(404).json({
        error: "This owl letter has expired or is unavailable.",
      });
    }
  });
  publicRouter.get("/", (_q, s) =>
    s.json({ expires: (s.locals.letter as Letter).expires }),
  );
  publicRouter.post("/open", async (_q, s) => {
    const id = (s.locals.letter as Letter).id;
    await serial(id, async () => {
      const r = await read(id);
      if (r.revoked || r.expires < Date.now()) {
        s.sendStatus(404);
        return;
      }
      r.opened ??= Date.now();
      await save(r);
      s.json({ ok: true, spell: r.spell || "", hasSketch: !!r.sketchHash });
    });
  });
  publicRouter.get("/image", async (_q, s) => {
    const r = s.locals.letter as Letter;
    if (!r.opened) {
      s.status(409).json({ error: "Open the letter first." });
      return;
    }
    s.type("png").send(await readFile(path(r.id, "image.png")));
  });
  publicRouter.get("/sketch", async (_q, s) => {
    const r = s.locals.letter as Letter;
    if (!r.opened || !r.sketchHash) {
      s.sendStatus(404);
      return;
    }
    s.type("png").send(await readFile(path(r.id, "sketch.png")));
  });
  publicRouter.post("/reply", async (q, s) => {
    if (!uuid(q.body?.id)) {
      s.status(400).json({ error: "Invalid reply." });
      return;
    }
    let image: Buffer;
    try {
      image = png(q.body.image);
    } catch (e) {
      s.status(400).json({ error: (e as Error).message });
      return;
    }
    const id = (s.locals.letter as Letter).id;
    await serial(id, async () => {
      const r = await read(id);
      if (r.revoked || r.expires < Date.now() || !r.opened) {
        s.sendStatus(404);
        return;
      }
      const prior = r.replies.find((x) => x.id === q.body.id);
      if (prior) {
        s.status(prior.hash === hash(image) ? 200 : 409).json({
          ok: prior.hash === hash(image),
        });
        return;
      }
      if (r.replies.length >= 10) {
        s.status(429).json({ error: "This letter already has ten replies." });
        return;
      }
      await atomic(id, `reply-${q.body.id}.png`, image);
      r.replies.push({ id: q.body.id, created: Date.now(), hash: hash(image) });
      await save(r);
      s.status(201).json({ ok: true });
    });
  });
  return { privateRouter, publicRouter };
}
