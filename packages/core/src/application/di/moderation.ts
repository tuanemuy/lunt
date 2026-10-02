import { DoContentDirectory } from "@repo/core/adapters/durableObject/contentDirectory";
import type { ModerationServices } from "../moderation/services";
import type { ServiceDeps } from "./serviceDeps";

/** Environment variables Moderation's wiring reads. */
export type ModerationEnv = Readonly<Record<never, never>>;

export function createModerationServices(
  _env: ModerationEnv,
  deps: ServiceDeps,
): ModerationServices {
  return { contentDirectory: new DoContentDirectory(deps.client) };
}
