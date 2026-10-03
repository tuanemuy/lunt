// Refuses a build that must not be deployed: one carrying the development
// configuration, a configuration whose vars still hold an `example` value,
// or no area master. The deploy workflows run it between the build and
// `wrangler deploy` (docs/deployment.md); by hand: `pnpm check:deploy-build`.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const configPath = fileURLToPath(
  new URL("../dist/server/wrangler.json", import.meta.url),
);
const areaIndexPath = fileURLToPath(
  new URL("../dist/client/area/index.json", import.meta.url),
);

if (!existsSync(configPath)) {
  console.error(`No build: ${configPath} is missing. Run the build first.`);
  process.exit(1);
}

const config = JSON.parse(readFileSync(configPath, "utf8"));
const vars = config.vars ?? {};
const problems = [];

for (const name of ["DEV_TOOLS", "SESSION_SECRET", "OPS_TOKEN"]) {
  if (name in vars) {
    problems.push(
      `vars.${name} is set: the build used a development configuration`,
    );
  }
}
for (const [name, value] of Object.entries(vars)) {
  if (typeof value === "string" && /example/i.test(value)) {
    problems.push(`vars.${name} still holds a sample value: ${value}`);
  }
}
if (vars.MAIL_TRANSPORT !== "smtp") {
  problems.push(`vars.MAIL_TRANSPORT is not "smtp": ${vars.MAIL_TRANSPORT}`);
}
if (vars.EXTERNAL_IDP !== "google") {
  problems.push(`vars.EXTERNAL_IDP is not "google": ${vars.EXTERNAL_IDP}`);
}
if (!existsSync(areaIndexPath)) {
  problems.push("dist/client/area/ is missing: run `pnpm area:import` first");
}

if (problems.length > 0) {
  console.error(`Refusing to deploy ${config.name}:`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`${config.name}: the build is fit to deploy.`);
