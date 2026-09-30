import type { Actor } from "@repo/core/domain/common/actor";
import { UnauthorizedError } from "../errors";

/** Bookmark's usecases act for a signed-in account only. */
export function requireSignedIn(actor: Actor | null): Actor {
  if (actor === null) {
    throw new UnauthorizedError("LOGIN_REQUIRED", "Login required");
  }
  return actor;
}
