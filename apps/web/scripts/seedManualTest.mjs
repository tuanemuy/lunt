// Seeds a manual-test document's test data into a running local server:
//   node apps/web/scripts/seedManualTest.mjs <document> [--port 3000]
// posts scripts/manual-test-fixtures/<document>.json to POST /__dev/seed
// (DEV_TOOLS=1, an empty state) and writes the ids it answers to
// .wrangler/seed-<document>-<port>.json. See docs/manual_test.md.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fixturesDir = new URL("./manual-test-fixtures/", import.meta.url);
const documents = readdirSync(fixturesDir)
  .filter((name) => name.endsWith(".json"))
  .map((name) => name.slice(0, -".json".length))
  .sort();

const args = process.argv.slice(2);
const portAt = args.indexOf("--port");
const port = portAt === -1 ? "3000" : args[portAt + 1];
const [document] = args.filter((_, i) => i !== portAt && i !== portAt + 1);
if (document === undefined || !documents.includes(document) || !port) {
  console.error(
    `Usage: node apps/web/scripts/seedManualTest.mjs <${documents.join("|")}> [--port 3000]`,
  );
  process.exit(2);
}

const fixture = readFileSync(new URL(`${document}.json`, fixturesDir), "utf8");
const url = `http://localhost:${port}/__dev/seed`;
let response;
try {
  response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: fixture,
  });
} catch (error) {
  console.error(`Could not reach ${url}: is the server running?`, error);
  process.exit(1);
}
const text = await response.text();
if (!response.ok) {
  console.error(`${url} answered ${response.status}: ${text}`);
  process.exit(1);
}

const ids = JSON.parse(text);
const outDir = new URL("../.wrangler/", import.meta.url);
mkdirSync(outDir, { recursive: true });
const outFile = new URL(`seed-${document}-${port}.json`, outDir);
writeFileSync(outFile, `${JSON.stringify(ids, null, 2)}\n`);
console.log(JSON.stringify(ids, null, 2));
for (const kind of ["places", "listings"]) {
  for (const [key, id] of Object.entries(ids[kind] ?? {})) {
    console.log(`${key}: http://localhost:${port}/${kind}/${id}`);
  }
}
console.log(`Saved to ${fileURLToPath(outFile)}`);
