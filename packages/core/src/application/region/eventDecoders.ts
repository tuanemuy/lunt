import type { EventDecoder } from "@repo/core/domain/common/event";
import { PlaceId, RegionId } from "@repo/core/domain/common/ids";
import type { RegionEvent } from "@repo/core/domain/region/events";
import { z } from "zod";
import { SystemError, SystemErrorCode } from "../errors";
import { buildEventDecoder } from "../events/buildDecoder";

/** A value that fails its value object is corrupt data, not a user error. */
const intact =
  <P, R>(rehydrate: (parsed: P) => R) =>
  (parsed: P): R => {
    try {
      return rehydrate(parsed);
    } catch (error) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        "Stored region event holds an invalid value",
        error,
      );
    }
  };

const regionOnlySchema = z.object({ regionId: z.string() }).strict();

const regionOnly = intact((p: z.infer<typeof regionOnlySchema>) => ({
  regionId: RegionId.create(p.regionId),
}));

type RegionEventDecoders = {
  readonly [K in RegionEvent["type"]]: EventDecoder<
    Extract<RegionEvent, { type: K }>
  >;
};

/** Decoders of Region's events (regions and affiliations) as stored in the outbox. */
export const regionEventDecoders: RegionEventDecoders = {
  "region.unpublished": buildEventDecoder(
    "region.unpublished",
    z
      .object({
        regionId: z.string(),
        reason: z.enum(["byManager", "photoTakedown"]),
      })
      .strict(),
    intact((p) => ({
      regionId: RegionId.create(p.regionId),
      reason: p.reason,
    })),
  ),
  "region.suspended": buildEventDecoder(
    "region.suspended",
    regionOnlySchema,
    regionOnly,
  ),
  "region.unsuspended": buildEventDecoder(
    "region.unsuspended",
    regionOnlySchema,
    regionOnly,
  ),
  "region.affiliation_established": buildEventDecoder(
    "region.affiliation_established",
    z.object({ placeId: z.string(), regionId: z.string() }).strict(),
    intact((p) => ({
      placeId: PlaceId.create(p.placeId),
      regionId: RegionId.create(p.regionId),
    })),
  ),
  "region.affiliation_dissolved": buildEventDecoder(
    "region.affiliation_dissolved",
    z
      .object({
        placeId: z.string(),
        regionId: z.string(),
        cause: z.enum(["left", "excluded"]),
      })
      .strict(),
    intact((p) => ({
      placeId: PlaceId.create(p.placeId),
      regionId: RegionId.create(p.regionId),
      cause: p.cause,
    })),
  ),
};
