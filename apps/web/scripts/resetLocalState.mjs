// Deletes the local Durable Object, queue and R2 state that `pnpm dev`
// persists under `.wrangler/state` (or `LUNT_STATE_DIR`, see vite.config.ts),
// so the next start begins empty.
import { rmSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";

const wranglerDir = fileURLToPath(new URL("../.wrangler/", import.meta.url));
const stateDir = process.env.LUNT_STATE_DIR || ".wrangler/state";
const target = fileURLToPath(new URL(`../${stateDir}`, import.meta.url));
const inside = relative(wranglerDir, target);
if (inside === "" || inside.startsWith("..")) {
  throw new Error(
    `LUNT_STATE_DIR must name a directory under .wrangler/: ${stateDir}`,
  );
}
rmSync(target, { recursive: true, force: true });
console.log(`Removed ${target}`);
