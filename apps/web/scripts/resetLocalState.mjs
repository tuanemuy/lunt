// Deletes the local Durable Object, queue and R2 state that `pnpm dev`
// persists under `.wrangler/state`, so the next start begins empty.
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const target = fileURLToPath(new URL("../.wrangler/state", import.meta.url));
rmSync(target, { recursive: true, force: true });
console.log(`Removed ${target}`);
