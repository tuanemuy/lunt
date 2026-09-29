import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { HoldingStatus } from "./detailView";
import { errorResponseMiddleware } from "./errorResponseMiddleware";
import type { PublicationView } from "./listingView";
import { validateInput } from "./validator";

/**
 * SM-05 所属地域の状況 and SM-06 イベントの状況 (`spec/pages/shop.md`): the
 * store's relations to regions and occasions as plain serializable data,
 * and the representative-region choice. The pending affiliation, leave
 * and participation applications (and the entries to RQ-05 / RQ-06) join
 * with stage 3b.
 */

/** A region's or an occasion's publication, as the management lists word it. */
export type ContentPublication = PublicationView["status"];

/** 下書き・公開中・公開の取り下げ (「管理する対象の状態」). */
export const CONTENT_PUBLICATION_LABEL = {
  draft: "下書き",
  published: "公開中",
  unpublished: "公開の取り下げ",
} as const satisfies Readonly<Record<ContentPublication, string>>;

/** 開催前・開催中・終了・中止 (「管理する対象の状態」). */
export const HOLDING_STATUS_LABEL = {
  upcoming: "開催前",
  ongoing: "開催中",
  ended: "終了",
  cancelled: "中止",
} as const satisfies Readonly<Record<HoldingStatus, string>>;

/**
 * Why viewers do not see a region or an occasion, or `null` when they do;
 * the suspension outranks the publication.
 */
export function hiddenReason(
  publication: ContentPublication,
  suspended: boolean,
): string | null {
  if (suspended) return "運営による非公開のため";
  switch (publication) {
    case "published":
      return null;
    case "unpublished":
      return "公開を取り下げているため";
    case "draft":
      return "未公開のため";
  }
}

/** One affiliated region of SM-05. */
export type AffiliatedRegionItem = Readonly<{
  regionId: string;
  /** `null` while the region has no name. */
  name: string | null;
  /** `2026年3月` / `3月` (the year only when it is not this year). */
  since: string;
  publication: ContentPublication;
  suspended: boolean;
  /** Viewers see it as one of the store's regions. */
  viewable: boolean;
}>;

export type AffiliationStatusData = Readonly<{
  /** First-affiliated order. */
  regions: readonly AffiliatedRegionItem[];
  /** The representative, and whether a steward chose it. */
  representative: Readonly<{ regionId: string; chosen: boolean }> | null;
  /** The region viewers are shown in lists; `null` when none is viewable. */
  displayedRegionId: string | null;
}>;

/** A listing attached to a participation, as SM-06 lists it. */
export type AttachedListingLine =
  | Readonly<{ listingId: string; deleted: true }>
  | Readonly<{
      listingId: string;
      deleted: false;
      name: string | null;
      /** 公開中 · 提供中 / 運営による非公開 · 一時非公開 · 提供中 … */
      stateText: string;
      viewable: boolean;
    }>;

/** One participation of SM-06. */
export type ShopEventItem = Readonly<{
  occasionId: string;
  name: string | null;
  periodText: string | null;
  publication: ContentPublication;
  suspended: boolean;
  /** `null` while the occasion has no period (a draft). */
  holding: HoldingStatus | null;
  listings: readonly AttachedListingLine[];
  /** The days within the period, as viewers see them. */
  days: readonly string[];
  /** The days the current period leaves out. */
  outOfPeriodDays: readonly string[];
}>;

export type ShopEventsData = Readonly<{
  /** Newest participation first. */
  items: readonly ShopEventItem[];
}>;

const idField = z.string().min(1).max(64);

export const chooseRepresentativeRegionSchema = z.object({
  placeId: idField,
  regionId: idField,
});

/**
 * SM-05: makes one of the store's affiliated regions its representative
 * (REG-04). Takes effect at once, without approval. CS-08 when the
 * affiliation was dissolved meanwhile (`REGION_NOT_AFFILIATED`) or the
 * region already is the representative
 * (`REGION_REPRESENTATIVE_ALREADY_CHOSEN`).
 */
export const chooseRepresentativeRegionFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(chooseRepresentativeRegionSchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { chooseRepresentativeRegion },
      { placeIdOf },
      { RegionId },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/region/chooseRepresentativeRegion"),
      import("./targetIds"),
      import("@repo/core/domain/common/ids"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    await chooseRepresentativeRegion({
      container,
      actor,
      input: {
        placeId: placeIdOf(data.placeId),
        regionId: RegionId.create(data.regionId),
      },
    });
    return null;
  });
