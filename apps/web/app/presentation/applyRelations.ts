import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type {
  CandidateRefusal,
  MembershipEntry,
  ParticipationChoice,
  ParticipationEntry,
  ParticipationListings,
  PlaceOption,
  RegionOption,
  RelationRefusal,
} from "./applyRelationsView";
import { errorResponseMiddleware } from "./errorResponseMiddleware";
import type { CandidatePage } from "./occasionView";
import { validateInput } from "./validator";

/*
 * RQ-05 所属・離脱の申請 and RQ-06 参加の申請: the submissions (idempotent on
 * the caller-minted ids), the candidates of their choices (CF-02) and the
 * refusal a submission met, read afresh. The resubmission goes through
 * `resubmitApplicationFn` (`./apply`).
 */

const idField = z.string().min(1).max(64);

const entryParam = z.string().trim().min(1).max(64).optional().catch(undefined);

/** `/apply/affiliation` (P0 付録): `placeId`・`regionId`・`mode=join|leave`, `resubmit` / `reapply`. */
export const membershipSearchSchema = z.object({
  placeId: entryParam,
  regionId: entryParam,
  mode: z.enum(["join", "leave"]).optional().catch(undefined),
  resubmit: entryParam,
  reapply: entryParam,
});

/** `/apply/participation`: `placeId`・`occasionId`, `resubmit` / `reapply`. */
export const participationSearchSchema = z.object({
  placeId: entryParam,
  occasionId: entryParam,
  resubmit: entryParam,
  reapply: entryParam,
});

/** A resubmission wins over a reapplication; either one names the whole target. */
export const membershipEntryOf = (
  search: z.infer<typeof membershipSearchSchema>,
): MembershipEntry => ({
  placeId: search.placeId ?? null,
  regionId: search.regionId ?? null,
  mode: search.mode ?? null,
  resubmit: search.resubmit ?? null,
  reapply: search.resubmit === undefined ? (search.reapply ?? null) : null,
});

export const participationEntryOf = (
  search: z.infer<typeof participationSearchSchema>,
): ParticipationEntry => ({
  placeId: search.placeId ?? null,
  occasionId: search.occasionId ?? null,
  resubmit: search.resubmit ?? null,
  reapply: search.resubmit === undefined ? (search.reapply ?? null) : null,
});

const keywordField = z
  .string()
  .max(100, "キーワードは100文字以内で入力してください");

const actingAsField = z.enum(["steward", "individual"]);

const membershipKindField = z.enum(["affiliation", "leave"]);

export const submitMembershipSchema = z.object({
  applicationId: idField,
  kind: membershipKindField,
  actingAs: actingAsField,
  placeId: idField,
  regionId: idField,
});

/** RQ-05: an affiliation or leave, as the store's steward or as an individual. */
export const submitAffiliationChangeFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(submitMembershipSchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { submitAffiliationChange },
      { parseGeneratedId },
      { placeIdOf, regionIdOf },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/application/submitAffiliationChange"),
      import("./validator"),
      import("./targetIds"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    const application = await submitAffiliationChange({
      container,
      actor,
      input: {
        applicationId: parseGeneratedId(
          container.idGenerator,
          "applicationId",
          data.applicationId,
        ),
        kind: data.kind,
        actingAs: data.actingAs,
        placeId: placeIdOf(data.placeId),
        regionId: regionIdOf(data.regionId),
      },
    });
    return { applicationId: application.id };
  });

const dayField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日付を選んでください");

export const submitParticipationSchema = z.object({
  applicationId: idField,
  placeId: idField,
  occasionId: idField,
  listingIds: z.array(idField).max(100, "掲載は100件までです"),
  dates: z.array(dayField).max(400, "参加日が多すぎます"),
});

/** RQ-06: a participation with its listings and days, as the store's steward. */
export const submitParticipationFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(submitParticipationSchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { submitParticipation },
      { parseGeneratedId },
      { placeIdOf, occasionIdOf, listingIdOf },
      { LocalDate },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/application/submitParticipation"),
      import("./validator"),
      import("./targetIds"),
      import("@repo/core/domain/common/localDate"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    const application = await submitParticipation({
      container,
      actor,
      input: {
        applicationId: parseGeneratedId(
          container.idGenerator,
          "applicationId",
          data.applicationId,
        ),
        placeId: placeIdOf(data.placeId),
        occasionId: occasionIdOf(data.occasionId),
        listingIds: data.listingIds.map(listingIdOf),
        dates: data.dates.map((date) => LocalDate.parse(date)),
      },
    });
    return { applicationId: application.id };
  });

/** RQ-05 CF-02 (所属): published regions, each judged for the store. */
export const findMembershipRegionsFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(
    validateInput(
      z.object({
        placeId: idField,
        actingAs: actingAsField,
        keyword: keywordField,
      }),
    ),
  )
  .handler(
    async ({
      data,
    }): Promise<
      Readonly<{ items: readonly RegionOption[]; count: number }>
    > => {
      const { findMembershipRegions } = await import("./applyRelationsData");
      return findMembershipRegions(data.placeId, data.actingAs, data.keyword);
    },
  );

/** RQ-05 from DT-03, CF-02: viewable stores without a steward, each judged for the region. */
export const findMembershipPlacesFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(
    validateInput(z.object({ regionId: idField, keyword: keywordField })),
  )
  .handler(
    async ({
      data,
    }): Promise<Readonly<{ items: readonly PlaceOption[]; count: number }>> => {
      const { findMembershipPlaces } = await import("./applyRelationsData");
      return findMembershipPlaces(data.regionId, data.keyword);
    },
  );

/**
 * RQ-05: the refusal a submission met, read afresh (「受け付けない事情」);
 * `null` when it would now be accepted.
 */
export const checkMembershipFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(
    validateInput(
      z.object({
        kind: membershipKindField,
        actingAs: actingAsField,
        placeId: idField,
        regionId: idField,
      }),
    ),
  )
  .handler(async ({ data }): Promise<RelationRefusal | null> => {
    const { membershipRefusal } = await import("./applyRelationsData");
    return membershipRefusal(data);
  });

/** RQ-06 CF-02: published upcoming and ongoing events, each judged for the store. */
export const findParticipationOccasionsFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(
    validateInput(z.object({ placeId: idField, keyword: keywordField })),
  )
  .handler(
    async ({
      data,
    }): Promise<
      CandidatePage &
        Readonly<{ refusals: Readonly<Record<string, CandidateRefusal>> }>
    > => {
      const { findParticipationOccasions } = await import(
        "./applyRelationsData"
      );
      return findParticipationOccasions(data.placeId, data.keyword);
    },
  );

const participationTargetSchema = z.object({
  placeId: idField,
  occasionId: idField,
});

/**
 * RQ-06: the event chosen for the store, judged, with the listings the
 * store can attach — read when a store or an event is chosen, and again
 * after a listing stopped being attachable (CS-08).
 */
export const participationChoiceFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(participationTargetSchema))
  .handler(async ({ data }): Promise<ParticipationChoice> => {
    const { participationChoice } = await import("./applyRelationsData");
    return participationChoice(data.placeId, data.occasionId);
  });

/**
 * RQ-06's resubmission: the store's listings for the event read again
 * after one stopped being attachable (CS-08). Unlike
 * `participationChoiceFn` it does not judge the event, which the
 * application being resubmitted would itself refuse.
 */
export const participationListingsFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(participationTargetSchema))
  .handler(async ({ data }): Promise<ParticipationListings> => {
    const { participationListings } = await import("./applyRelationsData");
    return participationListings(data.placeId, data.occasionId);
  });

/** RQ-06: the refusal a submission met, read afresh; `null` when it would now be accepted. */
export const checkParticipationFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(participationTargetSchema))
  .handler(async ({ data }): Promise<RelationRefusal | null> => {
    const { participationRefusal } = await import("./applyRelationsData");
    return participationRefusal(data.placeId, data.occasionId);
  });
