import { IdBatch } from "@repo/core/domain/common/idBatch";
import type { LocalDate } from "@repo/core/domain/common/localDate";
import { type BookmarkRef, ContentRef } from "@repo/core/domain/common/refs";
import type {
  ReferenceResolution,
  ResolvedTarget,
} from "@repo/core/domain/discovery/entry";
import {
  type ListingSummary,
  type PlaceSummary,
  ViewProjection,
} from "@repo/core/domain/discovery/viewProjection";
import type { ServiceArgs } from "../types";
import {
  listingSummaryPhotoIds,
  type PhotoRefs,
  photoRefsOf,
  placeSummaryPhotoIds,
  todayOf,
} from "./views";

export type ResolveReferencesInput = Readonly<{
  refs: readonly BookmarkRef[];
}>;

export type ResolvedSummary =
  | Readonly<{ kind: "listing"; summary: ListingSummary }>
  | Readonly<{ kind: "place"; summary: PlaceSummary }>;

/**
 * A saved reference as the saved list shows it: the target's summary with
 * its standing, or only the reference and that it is not viewable (no name,
 * photo or reason).
 */
export type ResolvedReference =
  | Readonly<{ ref: BookmarkRef; viewable: true; target: ResolvedSummary }>
  | Readonly<{ ref: BookmarkRef; viewable: false }>;

export type ResolveReferencesOutput = Readonly<{
  /** One per distinct ref, in first-seen order. */
  items: readonly ResolvedReference[];
  photos: PhotoRefs;
}>;

const summaryOf = (
  target: ResolvedTarget,
  today: LocalDate,
): ResolvedSummary => {
  switch (target.kind) {
    case "listing":
      return {
        kind: "listing",
        summary: ViewProjection.listingSummary(
          target.entry,
          { kind: "displayed" },
          today,
        ),
      };
    case "place":
      return {
        kind: "place",
        summary: ViewProjection.placeSummary(target.entry, {
          kind: "displayed",
        }),
      };
  }
};

const summaryPhotoIds = (target: ResolvedSummary) =>
  target.kind === "listing"
    ? listingSummaryPhotoIds(target.summary)
    : placeSummaryPhotoIds(target.summary);

/**
 * VW-10 (KEP-01–03): resolves saved listing and place references — an
 * account's (`listBookmarks`) or a device's — for the saved list, signed in
 * or not. Reference scene: upcoming / ended listings and closed places come
 * with their standing; a place without photos shows its substitute cover.
 * The references are not stored.
 */
export async function resolveReferences({
  container,
  input,
}: ServiceArgs<ResolveReferencesInput>): Promise<ResolveReferencesOutput> {
  const today = todayOf(container);
  const distinct = [
    ...new Map(input.refs.map((ref) => [ContentRef.key(ref), ref])).values(),
  ];
  const resolutions: ReferenceResolution[] = [];
  for (const batch of IdBatch.chunks(distinct)) {
    resolutions.push(...(await container.referenceQueries.resolve(batch)));
  }
  const items = distinct.map((ref, i): ResolvedReference => {
    const resolution = resolutions[i];
    return resolution?.viewable === true
      ? { ref, viewable: true, target: summaryOf(resolution.target, today) }
      : { ref, viewable: false };
  });
  const photos = await photoRefsOf(
    container,
    items.flatMap((item) =>
      item.viewable ? summaryPhotoIds(item.target) : [],
    ),
  );
  return { items, photos };
}
