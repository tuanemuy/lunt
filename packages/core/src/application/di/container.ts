// DI wiring of the Lunt runtime: one Worker whose fetch, queue and
// scheduled handlers all talk to the single Lunt state Durable Object
// (design.md D-02, D-05).
import type { LuntStateClient } from "@repo/core/adapters/do/protocol/client";
import { DoUnitOfWorkProvider } from "@repo/core/adapters/do/unitOfWork";
import { content } from "@repo/core/config";
import { z } from "zod";
import { SystemClock } from "../ports/clock";
import { UuidV7Generator } from "../ports/idGenerator";
import { ConsoleLogger } from "../ports/logger";
import type { RequestContainer, RuntimeSettings, SharedDeps } from "./types";

export type LuntEnv = Readonly<{
  APP_URL: string;
  DEV_TOOLS?: string | undefined;
  SESSION_SECRET?: string | undefined;
}>;

/**
 * The session secret the local `wrangler.jsonc` ships with. It is public,
 * so it is accepted only while the development tools are on.
 */
export const DEV_SESSION_SECRET = "lunt-local-development-session-secret";

const MIN_SECRET_LENGTH = 32;

const runtimeSchema = z
  .object({
    devTools: z.enum(["0", "1"]).default("0"),
    sessionSecret: z.string().min(MIN_SECRET_LENGTH),
  })
  .refine(
    (raw) => raw.devTools === "1" || raw.sessionSecret !== DEV_SESSION_SECRET,
    {
      message:
        "SESSION_SECRET is the public development secret while DEV_TOOLS is off",
    },
  );

export function readRuntimeSettings(env: LuntEnv): RuntimeSettings {
  const parsed = runtimeSchema.parse({
    devTools: env.DEV_TOOLS,
    sessionSecret: env.SESSION_SECRET,
  });
  return {
    devTools: parsed.devTools === "1",
    sessionSecret: parsed.sessionSecret,
  };
}

export function buildSharedDeps(): SharedDeps {
  return {
    clock: SystemClock,
    idGenerator: UuidV7Generator,
    logger: ConsoleLogger,
  };
}

export function createRequestContainer(
  env: LuntEnv,
  client: LuntStateClient,
): RequestContainer {
  const shared = buildSharedDeps();
  return {
    ...shared,
    config: { ...content, appUrl: env.APP_URL },
    runtime: readRuntimeSettings(env),
    unitOfWorkProvider: new DoUnitOfWorkProvider(client, shared.idGenerator),
  };
}
