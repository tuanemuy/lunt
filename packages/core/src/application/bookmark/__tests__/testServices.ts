import type { TestServiceDeps } from "../../__tests__/testServiceDeps";
import type { BookmarkServices } from "../services";

/** Bookmark's container ports for usecase tests. */
export function createTestBookmarkServices(
  _deps: TestServiceDeps,
): BookmarkServices {
  return {};
}
