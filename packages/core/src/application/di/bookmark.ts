import type { BookmarkServices } from "../bookmark/services";
import type { ServiceDeps } from "./serviceDeps";

/** Environment variables Bookmark's wiring reads. */
export type BookmarkEnv = Readonly<Record<never, never>>;

export function createBookmarkServices(
  _env: BookmarkEnv,
  _deps: ServiceDeps,
): BookmarkServices {
  return {};
}
