// DI wiring of the Lunt runtime: one Worker whose fetch, queue and
// scheduled handlers all talk to the single Lunt state Durable Object
// (design.md D-02, D-05).
import type { LuntStateClient } from "@repo/core/adapters/do/protocol/client";
import { DoUnitOfWorkProvider } from "@repo/core/adapters/do/unitOfWork";
import { content } from "@repo/core/config";
import { z } from "zod";
import { type Clock, SystemClock } from "../ports/clock";
import { UuidV7Generator } from "../ports/idGenerator";
import { ConsoleLogger } from "../ports/logger";
import { type AccountEnv, createAccountServices } from "./account";
import { type ApplicationEnv, createApplicationServices } from "./application";
import { type AreaEnv, createAreaServices } from "./area";
import { type AuthorityEnv, createAuthorityServices } from "./authority";
import { createDevServices } from "./dev";
import { createDiscoveryServices, type DiscoveryEnv } from "./discovery";
import { createListingServices, type ListingEnv } from "./listing";
import { createMediaServices, type MediaEnv } from "./media";
import { createModerationServices, type ModerationEnv } from "./moderation";
import {
  createNotificationServices,
  type NotificationEnv,
} from "./notification";
import { createPlaceServices, type PlaceEnv } from "./place";
import type { PresentationPorts } from "./presentationPorts";
import type { ServiceDeps } from "./serviceDeps";
import type { RequestContainer, RuntimeSettings, SharedDeps } from "./types";

export type LuntEnv = Readonly<{
  APP_URL: string;
  DEV_TOOLS?: string | undefined;
  /** `off` stops the Cron run of the daily jobs (development tools only). */
  DAILY_JOBS_AUTO?: string | undefined;
  SESSION_SECRET?: string | undefined;
  OPS_TOKEN?: string | undefined;
}> &
  AccountEnv &
  AuthorityEnv &
  ApplicationEnv &
  NotificationEnv &
  ModerationEnv &
  AreaEnv &
  MediaEnv &
  PlaceEnv &
  ListingEnv &
  DiscoveryEnv;

/**
 * The session secret the local `wrangler.jsonc` ships with. It is public,
 * so it is accepted only while the development tools are on.
 */
export const DEV_SESSION_SECRET = "lunt-local-development-session-secret";

/** The public operations token of the local `wrangler.jsonc`, same rule. */
export const DEV_OPS_TOKEN = "lunt-local-development-operations-token";

const MIN_SECRET_LENGTH = 32;

const runtimeSchema = z
  .object({
    devTools: z.enum(["0", "1"]).default("0"),
    sessionSecret: z.string().min(MIN_SECRET_LENGTH),
    opsToken: z.string().min(MIN_SECRET_LENGTH).optional(),
  })
  .refine(
    (raw) => raw.devTools === "1" || raw.sessionSecret !== DEV_SESSION_SECRET,
    {
      message:
        "SESSION_SECRET is the public development secret while DEV_TOOLS is off",
    },
  )
  .refine((raw) => raw.devTools === "1" || raw.opsToken !== DEV_OPS_TOKEN, {
    message: "OPS_TOKEN is the public development token while DEV_TOOLS is off",
  });

export function readRuntimeSettings(env: LuntEnv): RuntimeSettings {
  const parsed = runtimeSchema.parse({
    devTools: env.DEV_TOOLS,
    sessionSecret: env.SESSION_SECRET,
    opsToken: env.OPS_TOKEN,
  });
  return {
    devTools: parsed.devTools === "1",
    sessionSecret: parsed.sessionSecret,
    opsToken: parsed.opsToken ?? null,
  };
}

export function buildSharedDeps(clock: Clock = SystemClock): SharedDeps {
  return {
    clock,
    idGenerator: UuidV7Generator,
    logger: ConsoleLogger,
  };
}

/**
 * The container of one request, queue message or scheduled run. Each
 * domain contributes its container ports through `create…Services`.
 * `clock` is the run's clock — `requestClock` (`./clock.ts`), which
 * applies the development clock's offset while the development tools
 * are on.
 */
export function createRequestContainer(
  env: LuntEnv,
  client: LuntStateClient,
  presentation: PresentationPorts,
  clock: Clock = SystemClock,
): RequestContainer {
  const shared = buildSharedDeps(clock);
  const runtime = readRuntimeSettings(env);
  const deps: ServiceDeps = { client, shared, runtime, presentation };
  return {
    ...shared,
    config: { ...content, appUrl: env.APP_URL },
    runtime,
    unitOfWorkProvider: new DoUnitOfWorkProvider(client, shared.idGenerator),
    ...createAccountServices(env, deps),
    ...createAuthorityServices(env, deps),
    ...createApplicationServices(env, deps),
    ...createNotificationServices(env, deps),
    ...createModerationServices(env, deps),
    ...createDevServices(deps),
    ...createAreaServices(env, deps),
    ...createMediaServices(env, deps),
    ...createPlaceServices(env, deps),
    ...createListingServices(env, deps),
    ...createDiscoveryServices(env, deps),
  };
}
