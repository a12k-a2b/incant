import {
  createHash,
  createHmac,
  timingSafeEqual,
  randomBytes,
} from "node:crypto";
export function equalSecret(a: string, b: string) {
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );
}
export function createAccess(secret: string) {
  const sign = (v: string) =>
    createHmac("sha256", secret).update(v).digest("base64url");
  return {
    issue: () => {
      const v = Buffer.from(
        JSON.stringify({
          exp: Date.now() + 30 * 86400000,
          nonce: randomBytes(16).toString("hex"),
        }),
      ).toString("base64url");
      return v + "." + sign(v);
    },
    valid: (cookie: string) => {
      const token = cookie
        .split(";")
        .map((x) => x.trim())
        .find((x) => x.startsWith("incant_session="))
        ?.slice(15);
      if (!token) return false;
      const [v, sig] = token.split(".");
      if (!v || !sig || !equalSecret(sig, sign(v))) return false;
      try {
        return (
          JSON.parse(Buffer.from(v, "base64url").toString()).exp > Date.now()
        );
      } catch {
        return false;
      }
    },
  };
}
