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
import { type ArticleEnv, createArticleServices } from "./article";
import { type AuthorityEnv, createAuthorityServices } from "./authority";
import { type BookmarkEnv, createBookmarkServices } from "./bookmark";
import { devToolsEnabled } from "./clock";
import { createDevServices } from "./dev";
import { createDiscoveryServices, type DiscoveryEnv } from "./discovery";
import { createListingServices, type ListingEnv } from "./listing";
import { createMediaServices, type MediaEnv } from "./media";
import { createModerationServices, type ModerationEnv } from "./moderation";
import {
  createNotificationServices,
  type NotificationEnv,
} from "./notification";
import { createOccasionServices, type OccasionEnv } from "./occasion";
import { createPlaceServices, type PlaceEnv } from "./place";
import type { PresentationPorts } from "./presentationPorts";
import { createRegionServices, type RegionEnv } from "./region";
import type { ServiceDeps } from "./serviceDeps";
import type { RequestContainer, RuntimeSettings, SharedDeps } from "./types";

export type LuntEnv = Readonly<{
  APP_URL: string;
  DEV_TOOLS?: string | undefined;
  /** `1` keeps the development tools on for requests to other hosts (D-19). */
  DEV_TOOLS_ALLOW_REMOTE?: string | undefined;
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
  DiscoveryEnv &
  RegionEnv &
  OccasionEnv &
  BookmarkEnv &
  ArticleEnv;

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
        "SESSION_SECRET is the public development secret while the development tools are off (DEV_TOOLS, or a request to a host other than localhost without DEV_TOOLS_ALLOW_REMOTE)",
    },
  )
  .refine((raw) => raw.devTools === "1" || raw.opsToken !== DEV_OPS_TOKEN, {
    message:
      "OPS_TOKEN is the public development token while the development tools are off (DEV_TOOLS, or a request to a host other than localhost without DEV_TOOLS_ALLOW_REMOTE)",
  });

/**
 * The runtime settings of one run. `host` is the HTTP request's host, or
 * `null` for a queue batch or scheduled run: the development tools (and
 * the public development secrets they allow) are off for a request to any
 * other host than this machine unless `DEV_TOOLS_ALLOW_REMOTE=1`.
 */
export function readRuntimeSettings(
  env: LuntEnv,
  host: string | null = null,
): RuntimeSettings {
  z.enum(["0", "1"]).optional().parse(env.DEV_TOOLS);
  const parsed = runtimeSchema.parse({
    devTools: devToolsEnabled(env, host) ? "1" : "0",
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
 * are on. `host` is the HTTP request's host (`null` for a queue batch or a
 * scheduled run), which decides whether the development tools are on.
 */
export function createRequestContainer(
  env: LuntEnv,
  client: LuntStateClient,
  presentation: PresentationPorts,
  clock: Clock = SystemClock,
  host: string | null = null,
): RequestContainer {
  const shared = buildSharedDeps(clock);
  const runtime = readRuntimeSettings(env, host);
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
    ...createArticleServices(env, deps),
    ...createBookmarkServices(env, deps),
    ...createOccasionServices(env, deps),
    ...createRegionServices(env, deps),
  };
}
