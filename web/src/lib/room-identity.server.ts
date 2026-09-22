import { randomBytes } from "node:crypto";
import { join } from "node:path";
export function browserOwner(cookie: string): string | null {
  const token = cookie
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("incant_browser="))
    ?.slice(15);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}
export function newBrowserOwner() {
  return randomBytes(32).toString("hex");
}
export function ownerBackupRoot(root: string | undefined, owner: string) {
  if (!root || owner === "legacy") return root;
  if (!/^[a-f0-9]{64}$/.test(owner)) throw new Error("Invalid room identity");
  return join(root, "browsers", owner);
}
