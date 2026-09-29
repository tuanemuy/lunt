import { z } from "zod";
import type {
  CandidateRefusal,
  MembershipKind,
  PlaceOption,
  RegionOption,
  StateBadge,
} from "./applyRelationsView";

const text = z.string().max(2000);
const id = z.string().max(128);

const refusalSchema = z.object({
  badge: text.nullable(),
  reason: text,
  go: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("application"), applicationId: id }),
      z.object({ kind: z.literal("affiliationStatus"), placeId: id }),
      z.object({
        kind: z.literal("participation"),
        placeId: id,
        occasionId: id,
      }),
    ])
    .nullable(),
}) satisfies z.ZodType<CandidateRefusal>;

const badgeSchema = z.object({
  label: text,
  tone: z.enum(["accent", "muted", "alert", "neutral"]),
}) satisfies z.ZodType<StateBadge>;

const regionSchema = z.object({
  regionId: id,
  name: text,
  meta: text,
  photoUrl: text.nullable(),
  badges: z.array(badgeSchema).max(10),
  viewable: z.boolean(),
  refusal: refusalSchema.nullable(),
}) satisfies z.ZodType<RegionOption>;

const placeSchema = z.object({
  placeId: id,
  name: text,
  meta: text,
  sub: text,
  operating: text,
  address: text,
  photoUrl: text.nullable(),
  actingAs: z.enum(["steward", "individual"]),
  viewable: z.boolean(),
  refusal: refusalSchema.nullable(),
}) satisfies z.ZodType<PlaceOption>;

/** A keyword search of CF-02 as it stood: what is typed, and what the last search found. */
const searchSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    keyword: z.string().max(200),
    found: z
      .object({ keyword: z.string().max(200), items: z.array(item).max(100) })
      .nullable(),
  });

export type SearchSnapshot<T> = Readonly<{
  keyword: string;
  found: Readonly<{ keyword: string; items: readonly T[] }> | null;
}>;

/**
 * RQ-05's input kept across a visit to a candidate's detail (CF-02): the
 * store, the kind, the region, whether a region is being chosen again,
 * the reply, and both keyword searches.
 */
export type MembershipDraft = Readonly<{
  place: PlaceOption | null;
  kind: MembershipKind;
  region: RegionOption | null;
  picking: boolean;
  reply: string;
  regionSearch: SearchSnapshot<RegionOption> | null;
  placeSearch: SearchSnapshot<PlaceOption> | null;
}>;

export const membershipDraftSchema: z.ZodType<MembershipDraft> = z.object({
  place: placeSchema.nullable(),
  kind: z.enum(["affiliation", "leave"]),
  region: regionSchema.nullable(),
  picking: z.boolean(),
  reply: z.string().max(4000),
  regionSearch: searchSchema(regionSchema).nullable(),
  placeSearch: searchSchema(placeSchema).nullable(),
});
