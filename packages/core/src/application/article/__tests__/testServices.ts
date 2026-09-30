import type { TestServiceDeps } from "../../__tests__/testServiceDeps";
import type { ArticleServices } from "../services";

/** Article's container ports for usecase tests. */
export function createTestArticleServices(
  _deps: TestServiceDeps,
): ArticleServices {
  return {};
}
