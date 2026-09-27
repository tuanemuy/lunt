import type { AccountServices } from "../account/services";
import type { ApplicationServices } from "../application/services";
import type { AreaServices } from "../area/services";
import type { AuthorityServices } from "../authority/services";
import type { DevServices } from "../dev/services";
import type { DiscoveryServices } from "../discovery/services";
import type { UnitOfWorkProvider } from "../execution/unitOfWork";
import type { ListingServices } from "../listing/services";
import type { MediaServices } from "../media/services";
import type { ModerationServices } from "../moderation/services";
import type { NotificationServices } from "../notification/services";
import type { PlaceServices } from "../place/services";
import type { Clock } from "../ports/clock";
import type { IdGenerator } from "../ports/idGenerator";
import type { Logger } from "../ports/logger";
import type { OutboxRepository } from "../ports/outboxRepository";

/** Public site metadata. Safe to send to the browser. */
export type AppConfig = Readonly<{
  appUrl: string;
  siteName: string;
  defaultTitle: string;
  defaultDescription: string;
  twitterHandle?: string;
  themeColor: string;
}>;

/**
 * Server-only runtime settings. Never serialized to the browser — keep
 * them out of `AppConfig`.
 */
export type RuntimeSettings = Readonly<{
  /** Enables the `/__dev/*` tools and the development-only adapters. */
  devTools: boolean;
  /** HMAC key of the session cookie. */
  sessionSecret: string;
  /**
   * Bearer token of the operations endpoints (`/__ops/*`: dead letters,
   * relay kick). `null` turns the endpoints off.
   */
  opsToken: string | null;
}>;

/**
 * Cross-cutting deterministic deps shared between request and worker
 * containers. Held as ports so domain / application code stays free of
 * ambient time, id generation, and IO sinks.
 */
export type SharedDeps = Readonly<{
  clock: Clock;
  idGenerator: IdGenerator;
  logger: Logger;
}>;

/**
 * The container usecases run against — for HTTP requests, queue
 * consumers and daily jobs alike. Aggregate repositories are reached
 * only through `unitOfWorkProvider.run`; read-only ports that do not
 * join a unit of work are added here as their domains land.
 */
export type RequestContainer = SharedDeps &
  Readonly<{
    config: AppConfig;
    runtime: RuntimeSettings;
    unitOfWorkProvider: UnitOfWorkProvider;
  }> &
  AccountServices &
  AuthorityServices &
  ApplicationServices &
  NotificationServices &
  ModerationServices &
  DevServices &
  AreaServices &
  MediaServices &
  PlaceServices &
  ListingServices &
  DiscoveryServices;

/**
 * Container of the outbox relay, which runs inside the state Durable
 * Object's alarm. It touches the outbox directly and never a unit of
 * work.
 */
export type WorkerContainer = SharedDeps &
  Readonly<{
    outboxRepository: OutboxRepository;
  }>;
