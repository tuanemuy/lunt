import {
  FieldPatch,
  type FieldPatchSchema,
} from "@repo/core/domain/common/fieldPatch";
import type { CategoryId } from "@repo/core/domain/common/ids";
import type { PhotoSet } from "@repo/core/domain/common/photoSet";
import { PublishConditionUnmetError } from "@repo/core/domain/common/publication";
import { RevisedPhotos } from "@repo/core/domain/common/revisedPhotos";
import {
  ListingContent,
  type MissingForPublication,
  type PublishableListingContent,
} from "./content";
import { Offering } from "./offering";
import type { ListingDescription, ListingName, ListingPhoto } from "./values";

/**
 * One changed field of a listing revision. A revision cannot clear the
 * name or the category, and its photos hold at least one photo.
 */
export type ListingChange =
  | Readonly<{ field: "name"; value: ListingName }>
  | Readonly<{ field: "description"; value: ListingDescription | null }>
  | Readonly<{ field: "categoryId"; value: CategoryId }>
  | Readonly<{ field: "photos"; value: RevisedPhotos<ListingPhoto> }>
  | Readonly<{ field: "offering"; value: Offering }>;

/** The changed fields of a listing revision application (`FieldPatch`). */
export type ListingPatch = FieldPatch<ListingChange>;

type ListingCurrentValues = {
  name: ListingName | null;
  description: ListingDescription | null;
  categoryId: CategoryId | null;
  photos: PhotoSet<ListingPhoto>;
  offering: Offering;
};

const unmet = (missing: MissingForPublication): PublishConditionUnmetError =>
  new PublishConditionUnmetError("LISTING", [missing]);

const schema: FieldPatchSchema<
  ListingContent,
  ListingChange,
  ListingCurrentValues
> = {
  order: ["name", "description", "categoryId", "photos", "offering"],
  photoField: "photos",
  fields: {
    name: {
      read: (content) => content.name,
      equals: (a, b) => a === b,
      propose: (_current, desired) => {
        if (desired === null) throw unmet("name");
        return desired;
      },
      overlay: (content, value) => ({ ...content, name: value }),
    },
    description: {
      read: (content) => content.description,
      equals: (a, b) => a === b,
      propose: (_current, desired) => desired,
      overlay: (content, value) => ({ ...content, description: value }),
    },
    categoryId: {
      read: (content) => content.categoryId,
      equals: (a, b) => a === b,
      propose: (_current, desired) => {
        if (desired === null) throw unmet("category");
        return desired;
      },
      overlay: (content, value) => ({ ...content, categoryId: value }),
    },
    photos: {
      read: (content) => content.photos,
      equals: ListingContent.photosEqual,
      propose: (current, desired) => {
        if (desired.items.length === 0) throw unmet("photos");
        return RevisedPhotos.between(current, desired);
      },
      overlay: (content, value) => ({
        ...content,
        photos: RevisedPhotos.overlay(content.photos, value),
      }),
    },
    offering: {
      read: (content) => content.offering,
      equals: Offering.equals,
      propose: (_current, desired) => desired,
      overlay: (content, value) => ({ ...content, offering: value }),
    },
  },
};

export const ListingPatch = {
  schema,
  /**
   * The revision from `current` to `proposed` (submission and
   * resubmission). Throws `COMMON_INVALID_FIELD_PATCH` when nothing differs.
   */
  between: (
    current: ListingContent,
    proposed: PublishableListingContent,
  ): ListingPatch => FieldPatch.between(schema, current, proposed),
};
