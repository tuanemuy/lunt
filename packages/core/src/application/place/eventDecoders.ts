import type { EventDecoder } from "@repo/core/domain/common/event";
import { PlaceId } from "@repo/core/domain/common/ids";
import type { PlaceEvent } from "@repo/core/domain/place/events";
import { OperatingStatus } from "@repo/core/domain/place/operatingStatus";
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
        "Stored place event holds an invalid value",
        error,
      );
    }
  };

const statusSchema = z.enum(OperatingStatus.values);

const placeOnlySchema = z.object({ placeId: z.string() }).strict();

const placeOnly = intact((p: z.infer<typeof placeOnlySchema>) => ({
  placeId: PlaceId.create(p.placeId),
}));

type PlaceEventDecoders = {
  readonly [K in PlaceEvent["type"]]: EventDecoder<
    Extract<PlaceEvent, { type: K }>
  >;
};

/** Decoders of Place's events as stored in the outbox. */
export const placeEventDecoders: PlaceEventDecoders = {
  "place.operating_status_changed": buildEventDecoder(
    "place.operating_status_changed",
    z
      .object({ placeId: z.string(), from: statusSchema, to: statusSchema })
      .strict(),
    intact((p) => ({
      placeId: PlaceId.create(p.placeId),
      from: p.from,
      to: p.to,
    })),
  ),
  "place.suspended": buildEventDecoder(
    "place.suspended",
    placeOnlySchema,
    placeOnly,
  ),
  "place.unsuspended": buildEventDecoder(
    "place.unsuspended",
    placeOnlySchema,
    placeOnly,
  ),
};
