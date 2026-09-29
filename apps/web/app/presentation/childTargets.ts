// Server-only: import from server-function handlers (dynamically) or
// server-only loaders, never from components.
import type { RequestContainer } from "@repo/core/application/di/types";
import {
  isForbiddenError,
  isNotFoundError,
} from "@repo/core/application/errors";
import { getManagedListing } from "@repo/core/application/listing/getManagedListing";
import { getConfirmationRequest } from "@repo/core/application/moderation/getConfirmationRequest";
import { getManagedOccasion } from "@repo/core/application/occasion/getManagedOccasion";
import { getManagedPlace } from "@repo/core/application/place/getManagedPlace";
import type { Actor } from "@repo/core/domain/common/actor";
import { InfoReportId } from "@repo/core/domain/common/ids";
import {
  listingIdOf,
  occasionIdOf,
  parseTargetId,
  placeIdOf,
} from "./targetIds";

type Read = (container: RequestContainer, actor: Actor) => Promise<unknown>;

/**
 * The read of the target a screen below a management area is about, named
 * by the rest of its path: SM-04 / CM-03's listing, SM-07's request,
 * CM-04's event (from the store) or store (from the event). `null` for the
 * area's own screens.
 */
function childReadOf(path: string): Read | null {
  const listing =
    /^\/manage\/places\/[^/]+\/listings\/([^/]+)(?:\/preview)?\/?$/.exec(path);
  if (listing?.[1] !== undefined && listing[1] !== "new") {
    const raw = decodeURIComponent(listing[1]);
    return (container, actor) =>
      getManagedListing({
        container,
        actor,
        input: { listingId: listingIdOf(raw) },
      });
  }
  const request = /^\/manage\/places\/[^/]+\/checks\/([^/]+)\/?$/.exec(path);
  if (request?.[1] !== undefined) {
    const raw = decodeURIComponent(request[1]);
    return (container, actor) =>
      getConfirmationRequest({
        container,
        actor,
        input: {
          reportId: parseTargetId(
            InfoReportId.create,
            raw,
            "INFO_REPORT_NOT_FOUND",
          ),
        },
      });
  }
  const occasion = /^\/manage\/places\/[^/]+\/events\/([^/]+)\/?$/.exec(path);
  if (occasion?.[1] !== undefined) {
    const raw = decodeURIComponent(occasion[1]);
    return (container, actor) =>
      getManagedOccasion({
        container,
        actor,
        input: { occasionId: occasionIdOf(raw) },
      });
  }
  const place = /^\/manage\/events\/[^/]+\/participants\/([^/]+)\/?$/.exec(
    path,
  );
  if (place?.[1] !== undefined && place[1] !== "new") {
    const raw = decodeURIComponent(place[1]);
    return (container, actor) =>
      getManagedPlace({
        container,
        actor,
        input: { placeId: placeIdOf(raw) },
      });
  }
  return null;
}

/**
 * What a management area's guard throws when it refused the actor: the
 * `NotFoundError` of the target the screen at `path` is about when that
 * one is missing — a missing target is reported before access
 * (`spec/domains/index.md` 「エラーの種類」) — else `refusal` as it was.
 * Only a refusal pays for the extra read.
 */
export async function missingChildFirst(
  container: RequestContainer,
  actor: Actor,
  path: string | null,
  refusal: unknown,
): Promise<unknown> {
  if (path === null || !isForbiddenError(refusal)) return refusal;
  const read = childReadOf(path);
  if (read === null) return refusal;
  return read(container, actor).then(
    () => refusal,
    (error: unknown) => (isNotFoundError(error) ? error : refusal),
  );
}
