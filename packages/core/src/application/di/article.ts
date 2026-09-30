import type { ArticleServices } from "../article/services";
import type { ServiceDeps } from "./serviceDeps";

/** Environment variables Article's wiring reads. */
export type ArticleEnv = Readonly<Record<never, never>>;

export function createArticleServices(
  _env: ArticleEnv,
  _deps: ServiceDeps,
): ArticleServices {
  return {};
}
