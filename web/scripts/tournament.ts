import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
process.loadEnvFile(".env");
const root = new URL("../../docs/prompt-tournament/", import.meta.url),
  mode = process.argv[2] || "screen";
const candidates = JSON.parse(
  await readFile(new URL("candidates.json", root), "utf8"),
) as { id: string; template: string }[];
const cases = JSON.parse(
  await readFile(new URL("fixtures/cases.json", root), "utf8"),
) as { id: string; spell: string; phase: string; image: string }[];
const selected =
  mode === "final"
    ? (JSON.parse(
        await readFile(new URL("finalists.json", root), "utf8"),
      ) as string[])
    : candidates
        .filter((c) => (mode === "control" ? c.id === "P08" : c.id !== "P08"))
        .map((c) => c.id);
const jobs = candidates
  .filter((c) => selected.includes(c.id))
  .flatMap((c) =>
    cases
      .filter((f) =>
        mode === "control" ? f.id === "cottage" : f.phase === mode,
      )
      .flatMap((f) =>
        Array.from({ length: mode === "final" ? 2 : 1 }, (_, rep) => ({
          c,
          f,
          rep,
        })),
      ),
  );
await mkdir(new URL(mode + "/", root), { recursive: true });
let index = 0;
async function worker() {
  while (index < jobs.length) {
    const { c, f, rep } = jobs[index++],
      id = `${c.id}-${f.id}-${rep + 1}`,
      dir = new URL(mode + "/" + id + "/", root);
    await mkdir(dir, { recursive: true });
    try {
      await readFile(new URL("receipt.json", dir));
      console.log(id, "already attempted");
      continue;
    } catch {}
    const prompt = c.template.replaceAll("{{SPELL}}", f.spell);
    await writeFile(new URL("prompt.txt", dir), prompt);
    const png = await readFile(new URL("fixtures/" + f.image, root));
    const form = new FormData();
    form.append("model", "gpt-image-2.5-flare");
    form.append("quality", "medium");
    form.append("size", "1024x1536");
    form.append("prompt", prompt);
    form.append("image", new File([png], "sketch.png", { type: "image/png" }));
    const receipt: Record<string, unknown> = {
      id,
      candidate: c.id,
      case: f.id,
      repeat: rep + 1,
      date: new Date().toISOString(),
      model: "gpt-image-2.5-flare",
      quality: "medium",
      size: "1024x1536",
      inputSha256: createHash("sha256").update(png).digest("hex"),
      promptSha256: createHash("sha256").update(prompt).digest("hex"),
    };
    const start = Date.now();
    try {
      const res = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: "Bearer " + process.env.OPENAI_API_KEY },
        body: form,
        signal: AbortSignal.timeout(180000),
      });
      const b = await res.json();
      receipt.httpStatus = res.status;
      receipt.requestId = res.headers.get("x-request-id");
      receipt.usage = b.usage;
      receipt.status = res.ok && b.data?.[0]?.b64_json ? "PASS" : "FAIL";
      if (receipt.status === "PASS") {
        const image = Buffer.from(b.data[0].b64_json, "base64");
        await writeFile(new URL("result.png", dir), image);
        receipt.outputSha256 = createHash("sha256").update(image).digest("hex");
      } else receipt.error = b.error?.message || "No image returned";
    } catch (e) {
      receipt.status = "FAIL";
      receipt.error = e instanceof Error ? e.message : "Request failed";
    }
    receipt.elapsedMs = Date.now() - start;
    await writeFile(
      new URL("receipt.json", dir),
      JSON.stringify(receipt, null, 2),
    );
    console.log(id, receipt.status, receipt.elapsedMs, receipt.error || "");
  }
}
await Promise.all([worker(), worker(), worker()]);
