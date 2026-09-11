import { backupRouter } from './server/backup';
import express from "express";
import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
import { fileURLToPath } from "node:url";
import { editSketchToImage } from "./src/lib/openai-images.server";
import { mintToken } from "./src/lib/gemini-token.server";
import { createAccess, equalSecret } from "./src/lib/access.server";
import { MODEL_OPTIONS, QUALITY_OPTIONS } from "./src/lib/settings";
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
const secret = process.env.APP_ACCESS_KEY?.trim() || "";
if (process.env.NODE_ENV === "production" && !secret)
  throw new Error("APP_ACCESS_KEY must be configured for hosted Incant.");
const access = createAccess(secret);
const attempts = new Map<string, { count: number; until: number }>();
app.get("/.well-known/assetlinks.json", (_req, res) =>
  res.sendFile(
    fileURLToPath(
      new URL(
        process.env.NODE_ENV === "production"
          ? "./dist/.well-known/assetlinks.json"
          : "./public/.well-known/assetlinks.json",
        import.meta.url,
      ),
    ),
    { dotfiles: "allow" },
  ),
);
app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  const origin = req.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== req.get("host")) throw new Error();
    } catch {
      res
        .status(403)
        .json({ ok: false, error: "Please cast from the Incant page." });
      return;
    }
  }
  next();
});
app.use(express.json({ limit: "12mb" }));
app.get("/api/session", (req, res) => {
  const unlocked = !secret || access.valid(req.get("cookie") || "");
  res.json({
    unlocked,
    imageReady: unlocked && Boolean(process.env.OPENAI_API_KEY),
    voiceReady: unlocked && Boolean(process.env.GEMINI_API_KEY),
  });
});
app.post("/api/unlock", (req, res) => {
  const now = Date.now(),
    ip = req.ip || "unknown";
  for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
  const attempt = attempts.get(ip) || { count: 0, until: now + 15 * 60000 };
  if (attempt.count >= 10 || attempts.size > 10000) {
    res
      .status(429)
      .json({ ok: false, error: "Too many attempts. Please wait 15 minutes." });
    return;
  }
  attempt.count++;
  attempts.set(ip, attempt);
  if (
    typeof req.body?.password !== "string" ||
    !secret ||
    !equalSecret(req.body.password, secret)
  ) {
    res
      .status(401)
      .json({ ok: false, error: "That passphrase did not open the room." });
    return;
  }
  attempts.delete(ip);
  res.setHeader(
    "Set-Cookie",
    "incant_session=" +
      access.issue() +
      "; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000" +
      (process.env.NODE_ENV === "production" ? "; Secure" : ""),
  );
  res.json({ ok: true });
});
app.use("/api", (req, res, next) => {
  if (secret && !access.valid(req.get("cookie") || "")) {
    res
      .status(401)
      .json({ ok: false, error: "Please unlock the drawing room again." });
    return;
  }
  next();
});
app.use("/api/backup", backupRouter(process.env.RAILWAY_VOLUME_MOUNT_PATH ? `${process.env.RAILWAY_VOLUME_MOUNT_PATH}/incant-backup-v1` : process.env.INCANT_BACKUP_PATH));
let activeCasts = 0;
const castTimes: number[] = [];
app.post("/api/cast", (_req, res, next) => {
  const now = Date.now();
  while (castTimes.length && castTimes[0] < now - 3600000) castTimes.shift();
  if (activeCasts >= 4 || castTimes.length >= 60) {
    res.status(429).json({
      ok: false,
      error:
        "The room has cast many spells. Give it a little time before another.",
    });
    return;
  }
  activeCasts++;
  castTimes.push(now);
  next();
});
app.post("/api/cast", async (req, res) => {
  try {
    const b = req.body;
    if (
      !b ||
      typeof b.incantation !== "string" ||
      !b.incantation.trim() ||
      b.incantation.length > 4000 ||
      typeof b.sketchPngBase64 !== "string"
    ) {
      res.status(400).json({
        ok: false,
        error: "A drawing and a spell of up to 4,000 characters are needed.",
      });
      return;
    }
    const result = await editSketchToImage({
      openaiKey: typeof b.openaiKey === "string" ? b.openaiKey : "",
      sketchPngBase64: b.sketchPngBase64,
      incantation: b.incantation,
      livePaper: b.livePaper !== false,
      variationIndex: Number.isInteger(b.variationIndex)
        ? Math.max(0, b.variationIndex)
        : 0,
      quality: QUALITY_OPTIONS.includes(b.quality) ? b.quality : "medium",
      model: MODEL_OPTIONS.includes(b.model) ? b.model : MODEL_OPTIONS[0],
      size: b.size === "1536x1024" ? b.size : "1024x1536",
    });
    res.status(result.ok ? 200 : 400).json(result);
  } finally {
    activeCasts--;
  }
});
app.post("/api/gemini-token", async (req, res) => {
  const result = await mintToken(
    new Request("http://localhost/api/gemini-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body ?? {}),
    }),
  );
  res.status(result.status).json(await result.json());
});
app.use("/api", (_req, res) => {
  res.status(404).json({ ok: false, error: "Unknown spell endpoint." });
});
if (process.env.NODE_ENV === "production") {
  app.use(express.static(fileURLToPath(new URL("./dist", import.meta.url))));
  app.get("/", (_req, res) =>
    res.sendFile(fileURLToPath(new URL("./dist/index.html", import.meta.url))),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
app.use(
  (
    err: { status?: number },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    res.status(err.status === 413 ? 413 : 500).json({
      ok: false,
      error:
        err.status === 413
          ? "This drawing is too large to send."
          : "The spell could not finish. Your sketch is safe; try again.",
    });
  },
);
// Local use by default: do not expose account-backed endpoints on a public host.
app.listen(
  Number(process.env.PORT || 5173),
  process.env.HOST || "127.0.0.1",
  () => console.log("Incant: http://localhost:" + (process.env.PORT || 5173)),
);
