// Server-only: import from server-function handlers (dynamically), never
// from components.
import type { RequestContainer } from "@repo/core/application/di/types";
import {
  ForbiddenError,
  isForbiddenError,
} from "@repo/core/application/errors";
import { getManagedListing } from "@repo/core/application/listing/getManagedListing";
import { getInfoReport } from "@repo/core/application/moderation/getInfoReport";
import { getTakedownClaim } from "@repo/core/application/moderation/getTakedownClaim";
import { getManagedOccasion } from "@repo/core/application/occasion/getManagedOccasion";
import { getManagedPlace } from "@repo/core/application/place/getManagedPlace";
import { getManagedRegion } from "@repo/core/application/region/getManagedRegion";
import type { Actor } from "@repo/core/domain/common/actor";
import { InfoReportId, TakedownClaimId } from "@repo/core/domain/common/ids";
import { isOperator } from "./operatorAccess";
import {
  listingIdOf,
  occasionIdOf,
  parseTargetId,
  placeIdOf,
  regionIdOf,
} from "./targetIds";

type Read = (container: RequestContainer, actor: Actor) => Promise<unknown>;

/** OM-04's claim or OM-05's report read (`/ops/{takedowns|reports}/{id}`), or `null`. */
function caseReadOf(path: string): Read | null {
  const match = /^\/ops\/(takedowns|reports)\/([^/]+)\/?$/.exec(path);
  if (match === null) return null;
  const [, area, raw = ""] = match;
  const id = decodeURIComponent(raw);
  return area === "takedowns"
    ? (container, actor) =>
        getTakedownClaim({
          container,
          actor,
          input: {
            claimId: parseTargetId(
              TakedownClaimId.create,
              id,
              "TAKEDOWN_CLAIM_NOT_FOUND",
            ),
          },
        })
    : (container, actor) =>
        getInfoReport({
          container,
          actor,
          input: {
            reportId: parseTargetId(
              InfoReportId.create,
              id,
              "INFO_REPORT_NOT_FOUND",
            ),
          },
        });
}

/** OM-03's subject read (`/ops/subjects/{kind}/{id}`), or `null`. */
function subjectReadOf(path: string): Read | null {
  const match = /^\/ops\/subjects\/([^/]+)\/([^/]+)\/?$/.exec(path);
  if (match === null) return null;
  const [, kind, raw = ""] = match;
  const id = decodeURIComponent(raw);
  switch (kind) {
    case "place":
      return (container, actor) =>
        getManagedPlace({
          container,
          actor,
          input: { placeId: placeIdOf(id) },
        });
    case "listing":
      return (container, actor) =>
        getManagedListing({
          container,
          actor,
          input: { listingId: listingIdOf(id) },
        });
    case "region":
      return (container, actor) =>
        getManagedRegion({
          container,
          actor,
          input: { regionId: regionIdOf(id) },
        });
    case "occasion":
      return (container, actor) =>
        getManagedOccasion({
          container,
          actor,
          input: { occasionId: occasionIdOf(id) },
        });
    default:
      return null;
  }
}

/**
 * The OM area's guard: `ForbiddenError` (CS-05) unless the actor is an
 * operator. A screen about one target (OM-03's subject, OM-04's claim,
 * OM-05's report) that does not exist is `NotFoundError` (CS-17) for
 * anyone: the missing target is reported before access
 * (`spec/domains/index.md` 「エラーの種類」). Only non-operators pay for the
 * extra read; its refusal only confirms the target exists.
 */
export async function requireOpsAccess(
  container: RequestContainer,
  actor: Actor,
  path: string,
): Promise<void> {
  if (await isOperator(container, actor)) return;
  const read = subjectReadOf(path) ?? caseReadOf(path);
  if (read !== null) {
    await read(container, actor).catch((error: unknown) => {
      if (!isForbiddenError(error)) throw error;
    });
  }
  throw new ForbiddenError(
    "OPERATOR_REQUIRED",
    "Only operators may open this screen",
  );
}
