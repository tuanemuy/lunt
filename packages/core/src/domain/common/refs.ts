import {
  ApplicationId,
  ArticleId,
  ListingId,
  OccasionId,
  PlaceId,
  RegionId,
} from "@repo/core/domain/common/ids";

/** A listing, place, region, occasion or article, referenced by id. */
export type ContentRef =
  | Readonly<{ kind: "listing"; id: ListingId }>
  | Readonly<{ kind: "place"; id: PlaceId }>
  | Readonly<{ kind: "region"; id: RegionId }>
  | Readonly<{ kind: "occasion"; id: OccasionId }>
  | Readonly<{ kind: "article"; id: ArticleId }>;

export type ContentKind = ContentRef["kind"];

/** What an article can showcase. */
export type ShowcaseRef = Extract<
  ContentRef,
  { kind: "listing" | "place" | "region" | "occasion" }
>;
export type ShowcaseKind = ShowcaseRef["kind"];

/** What a viewer can bookmark. */
export type BookmarkRef = Extract<ContentRef, { kind: "listing" | "place" }>;
export type BookmarkKind = BookmarkRef["kind"];

/** What a manager / operator can hold stewardship over. */
export type StewardedRef = Extract<
  ContentRef,
  { kind: "place" | "region" | "occasion" }
>;
export type StewardedKind = StewardedRef["kind"];

/** Who owns a photo: a content aggregate or an application. */
export type PhotoOwnerRef =
  | ContentRef
  | Readonly<{ kind: "application"; id: ApplicationId }>;
export type PhotoOwnerKind = PhotoOwnerRef["kind"];

type AnyRef = PhotoOwnerRef;

/**
 * `"<kind>:<id>"`. Unique across every ref type because the kind prefix
 * separates id spaces; usable as a map key or an `aggregateId`.
 */
const key = (ref: AnyRef): string => `${ref.kind}:${ref.id}`;

const equals = (a: AnyRef, b: AnyRef): boolean =>
  a.kind === b.kind && a.id === b.id;

const contentKinds = [
  "listing",
  "place",
  "region",
  "occasion",
  "article",
] as const satisfies readonly ContentKind[];
const showcaseKinds = [
  "listing",
  "place",
  "region",
  "occasion",
] as const satisfies readonly ShowcaseKind[];
const bookmarkKinds = [
  "listing",
  "place",
] as const satisfies readonly BookmarkKind[];
const stewardedKinds = [
  "place",
  "region",
  "occasion",
] as const satisfies readonly StewardedKind[];
const photoOwnerKinds = [
  ...contentKinds,
  "application",
] as const satisfies readonly PhotoOwnerKind[];

const includes = <K extends string>(
  kinds: readonly K[],
  kind: string,
): kind is K => (kinds as readonly string[]).includes(kind);

/**
 * Builds the ref for `kind` with `rawId` validated by the matching id
 * constructor, so a transport boundary cannot pair a kind with the wrong id
 * brand.
 */
const createContentRef = (kind: ContentKind, rawId: string): ContentRef => {
  switch (kind) {
    case "listing":
      return { kind, id: ListingId.create(rawId) };
    case "place":
      return { kind, id: PlaceId.create(rawId) };
    case "region":
      return { kind, id: RegionId.create(rawId) };
    case "occasion":
      return { kind, id: OccasionId.create(rawId) };
    case "article":
      return { kind, id: ArticleId.create(rawId) };
  }
};

export const ContentRef = {
  kinds: contentKinds,
  isKind: (kind: string): kind is ContentKind => includes(contentKinds, kind),
  create: createContentRef,
  key,
  equals,
};

export const ShowcaseRef = {
  kinds: showcaseKinds,
  isKind: (kind: string): kind is ShowcaseKind => includes(showcaseKinds, kind),
  is: (ref: ContentRef): ref is ShowcaseRef =>
    includes(showcaseKinds, ref.kind),
  create: (kind: ShowcaseKind, rawId: string): ShowcaseRef =>
    createContentRef(kind, rawId) as ShowcaseRef,
};

export const BookmarkRef = {
  kinds: bookmarkKinds,
  isKind: (kind: string): kind is BookmarkKind => includes(bookmarkKinds, kind),
  is: (ref: ContentRef): ref is BookmarkRef =>
    includes(bookmarkKinds, ref.kind),
  create: (kind: BookmarkKind, rawId: string): BookmarkRef =>
    createContentRef(kind, rawId) as BookmarkRef,
};

export const StewardedRef = {
  kinds: stewardedKinds,
  isKind: (kind: string): kind is StewardedKind =>
    includes(stewardedKinds, kind),
  is: (ref: ContentRef): ref is StewardedRef =>
    includes(stewardedKinds, ref.kind),
  create: (kind: StewardedKind, rawId: string): StewardedRef =>
    createContentRef(kind, rawId) as StewardedRef,
};

export const PhotoOwnerRef = {
  kinds: photoOwnerKinds,
  isKind: (kind: string): kind is PhotoOwnerKind =>
    includes(photoOwnerKinds, kind),
  create: (kind: PhotoOwnerKind, rawId: string): PhotoOwnerRef =>
    kind === "application"
      ? { kind, id: ApplicationId.create(rawId) }
      : createContentRef(kind, rawId),
  key,
  equals,
};
