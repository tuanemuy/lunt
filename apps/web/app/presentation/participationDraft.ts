import { z } from "zod";
import type { CandidateRefusal } from "./applyRelationsView";
import type { CandidateItem, CandidatePage } from "./occasionView";

const text = z.string().max(2000);
const id = z.string().max(128);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

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

const candidateSchema = z.object({
  id,
  name: text,
  meta: text,
  photoUrl: text.nullable(),
  refusal: text.nullable(),
}) satisfies z.ZodType<CandidateItem>;

const pageSchema = z.object({
  items: z.array(candidateSchema).max(100),
  count: z.number().int().min(0),
}) satisfies z.ZodType<CandidatePage>;

/**
 * RQ-06's input kept across a visit to a page it links to (CF-02; the
 * event's DT-04, a candidate's DT-04, a listing's DT-01): the store and
 * the event by id — both are read again on return, so their reasons are
 * current — whether an event is being chosen again, the listings (with
 * the names they were picked by) and days attached, the reply, and the
 * event search with the reasons its candidates were refused for.
 */
export type ParticipationDraft = Readonly<{
  placeId: string | null;
  occasionId: string | null;
  picking: boolean;
  listingIds: readonly string[];
  picked: readonly (readonly [string, string | null])[];
  dates: readonly string[];
  reply: string;
  search: Readonly<{
    keyword: string;
    found: Readonly<{ keyword: string; page: CandidatePage }> | null;
    refusals: Readonly<Record<string, CandidateRefusal>>;
  }> | null;
}>;

export const participationDraftSchema: z.ZodType<ParticipationDraft> = z.object(
  {
    placeId: id.nullable(),
    occasionId: id.nullable(),
    picking: z.boolean(),
    listingIds: z.array(id).max(200),
    picked: z.array(z.tuple([id, text.nullable()])).max(400),
    dates: z.array(day).max(400),
    reply: z.string().max(4000),
    search: z
      .object({
        keyword: z.string().max(200),
        found: z
          .object({ keyword: z.string().max(200), page: pageSchema })
          .nullable(),
        refusals: z.record(id, refusalSchema),
      })
      .nullable(),
  },
);
