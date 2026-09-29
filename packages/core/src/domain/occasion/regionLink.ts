import type { WithEventDrafts } from "@repo/core/domain/common/event";
import { OccasionId, RegionId } from "@repo/core/domain/common/ids";
import { Version } from "@repo/core/domain/common/version";
import { BusinessRuleError, RehydrationError } from "@repo/core/domain/error";
import { OccasionErrorCode } from "./errorCode";
import {
  OccasionEvents,
  type RegionLinkDetachedEvent,
  type RegionLinkedEvent,
  regionLinkAggregateId,
} from "./events";

/** A region link's identity: one occasion and one region. */
export type RegionLinkKey = Readonly<{
  occasionId: OccasionId;
  regionId: RegionId;
}>;

export const RegionLinkKey = {
  equals: (a: RegionLinkKey, b: RegionLinkKey): boolean =>
    a.occasionId === b.occasionId && a.regionId === b.regionId,
  /** `"{occasionId}:{regionId}"`, the events' `aggregateId`. */
  toString: (key: RegionLinkKey): string =>
    regionLinkAggregateId(key.occasionId, key.regionId),
};

type RegionLinkBase = Readonly<{
  key: RegionLinkKey;
  /** When it was first linked; a restore keeps it. */
  linkedAt: Date;
  version: Version;
  updatedAt: Date;
}>;

export type ActiveRegionLink = RegionLinkBase & Readonly<{ status: "linked" }>;
export type DetachedRegionLink = RegionLinkBase &
  Readonly<{ status: "detached" }>;

/**
 * An occasion held in a region (開催地域の関連づけ). The occasion's side
 * links and unlinks (deleting it); the region's side detaches and
 * restores. A detached pair can be brought back only by the region's side.
 */
export type RegionLink = ActiveRegionLink | DetachedRegionLink;

export type RegionLinkStatus = RegionLink["status"];

/** The at-rest form of a region link, in primitives. */
export type RegionLinkSnapshot = Readonly<{
  occasionId: string;
  regionId: string;
  status: string;
  linkedAt: Date;
  updatedAt: Date;
  version: number;
}>;

const detachedError = (): BusinessRuleError<OccasionErrorCode> =>
  new BusinessRuleError(
    OccasionErrorCode.RegionLinkDetached,
    "The region's operator detached this link",
  );

/**
 * The occasion's operator links a viewable region; no approval.
 * `OCCASION_REGION_ALREADY_LINKED` / `OCCASION_REGION_LINK_DETACHED` when
 * `existing` is linked / detached, then `OCCASION_REGION_NOT_VIEWABLE`.
 */
function link(
  existing: RegionLink | null,
  key: RegionLinkKey,
  facts: Readonly<{ regionViewable: boolean }>,
  now: Date,
): WithEventDrafts<ActiveRegionLink, RegionLinkedEvent> {
  if (existing?.status === "linked") {
    throw new BusinessRuleError(
      OccasionErrorCode.RegionAlreadyLinked,
      "The region is already linked",
    );
  }
  if (existing?.status === "detached") throw detachedError();
  if (!facts.regionViewable) {
    throw new BusinessRuleError(
      OccasionErrorCode.RegionNotViewable,
      "The region is not viewable",
    );
  }
  return {
    entity: {
      key,
      status: "linked",
      linkedAt: now,
      version: Version.initial(),
      updatedAt: now,
    },
    eventDrafts: [
      OccasionEvents.regionLinked(key.occasionId, key.regionId, now),
    ],
  };
}

/**
 * The occasion's operator removes a linked pair; returns the key the
 * usecase deletes. `OCCASION_REGION_LINK_DETACHED` for a detached pair.
 */
function unlink(link: RegionLink): RegionLinkKey {
  if (link.status === "detached") throw detachedError();
  return link.key;
}

/** The region's operator detaches; `OCCASION_REGION_LINK_ALREADY_DETACHED` if it is. */
function detach(
  link: RegionLink,
  now: Date,
): WithEventDrafts<DetachedRegionLink, RegionLinkDetachedEvent> {
  if (link.status === "detached") {
    throw new BusinessRuleError(
      OccasionErrorCode.RegionLinkAlreadyDetached,
      "The link is already detached",
    );
  }
  return {
    entity: {
      ...link,
      status: "detached",
      version: Version.next(link.version),
      updatedAt: now,
    },
    eventDrafts: [
      OccasionEvents.regionLinkDetached(
        link.key.occasionId,
        link.key.regionId,
        now,
      ),
    ],
  };
}

/** The region's operator restores a detached pair; `linkedAt` is kept. */
function restore(
  link: RegionLink,
  now: Date,
): WithEventDrafts<ActiveRegionLink, never> {
  if (link.status === "linked") {
    throw new BusinessRuleError(
      OccasionErrorCode.RegionLinkNotDetached,
      "The link is not detached",
    );
  }
  return {
    entity: {
      ...link,
      status: "linked",
      version: Version.next(link.version),
      updatedAt: now,
    },
    eventDrafts: [],
  };
}

function reconstruct(snapshot: RegionLinkSnapshot): RegionLink {
  try {
    const base: RegionLinkBase = {
      key: {
        occasionId: OccasionId.create(snapshot.occasionId),
        regionId: RegionId.create(snapshot.regionId),
      },
      linkedAt: snapshot.linkedAt,
      version: Version.create(snapshot.version),
      updatedAt: snapshot.updatedAt,
    };
    switch (snapshot.status) {
      case "linked":
        return { ...base, status: "linked" };
      case "detached":
        return { ...base, status: "detached" };
      default:
        throw new Error(`Unknown region link status ${snapshot.status}`);
    }
  } catch (error) {
    throw new RehydrationError("Stored region link violates invariants", error);
  }
}

const snapshot = (link: RegionLink): RegionLinkSnapshot => ({
  occasionId: link.key.occasionId,
  regionId: link.key.regionId,
  status: link.status,
  linkedAt: link.linkedAt,
  updatedAt: link.updatedAt,
  version: link.version,
});

export const RegionLink = {
  link,
  unlink,
  detach,
  restore,
  reconstruct,
  snapshot,
};
