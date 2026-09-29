import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ApplyRefusal } from "./applyView";
import type { ListingPreviewViews } from "./detailView";
import { errorResponseMiddleware } from "./errorResponseMiddleware";
import { listingContentSchema } from "./listing";
import type { CategoryOption } from "./listingView";
import { placeProfileSchema } from "./place";
import { OPERATING_STATUSES } from "./placeView";
import { validateInput } from "./validator";

/*
 * The application screens' server functions (RQ-02〜RQ-04): the
 * submissions (idempotent on the caller-minted ids), the resubmission, the
 * preview of a listing being applied for, and the eligibility check the
 * screens repeat after a refusal at submission.
 */

const idField = z.string().min(1).max(64);

const entryParam = z.string().trim().min(1).max(64).optional().catch(undefined);

/**
 * `?resubmit=<applicationId>` (再提出) and `?reapply=<applicationId>`
 * (再申請), from MY-05. Only the shape is checked here; the loader reads
 * the application (CS-06 when it is not one this screen takes).
 */
export const applySearchSchema = z.object({
  resubmit: entryParam,
  reapply: entryParam,
});

/** RQ-04 adds its preview step (CM-03 from RQ-04). */
export const listingApplySearchSchema = applySearchSchema.extend({
  step: z.enum(["preview"]).optional().catch(undefined),
});

/** The loader's entry: a resubmission wins over a reapplication. */
export const entryOf = (
  search: z.infer<typeof applySearchSchema>,
): Readonly<{ resubmit: string | null; reapply: string | null }> => ({
  resubmit: search.resubmit ?? null,
  reapply: search.resubmit === undefined ? (search.reapply ?? null) : null,
});

const claimText = (label: string) =>
  z.string().max(4000, `${label}は4000文字以内で入力してください`);

export const claimSchema = z.object({
  relationship: claimText("店舗との関係"),
  evidence: claimText("確認に使える連絡先・資料"),
});

export const submitRegistrationSchema = z.object({
  applicationId: idField,
  profile: placeProfileSchema,
  stewardship: claimSchema.extend({ applicationId: idField }).nullable(),
});

/** RQ-02 登録: the registration, and the claim filed with it when chosen. */
export const submitPlaceRegistrationFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(submitRegistrationSchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { submitPlaceRegistration },
      { parseGeneratedId },
      { profileFieldsOf },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/application/submitPlaceRegistration"),
      import("./validator"),
      import("./shopData"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    const submitted = await submitPlaceRegistration({
      container,
      actor,
      input: {
        applicationId: parseGeneratedId(
          container.idGenerator,
          "applicationId",
          data.applicationId,
        ),
        profile: profileFieldsOf(data.profile),
        stewardship:
          data.stewardship === null
            ? null
            : {
                applicationId: parseGeneratedId(
                  container.idGenerator,
                  "stewardship.applicationId",
                  data.stewardship.applicationId,
                ),
                relationship: data.stewardship.relationship,
                evidence: data.stewardship.evidence,
              },
      },
    });
    return {
      registrationId: submitted.registration.id,
      stewardshipId: submitted.stewardship?.id ?? null,
    };
  });

export const submitPlaceRevisionSchema = z.object({
  applicationId: idField,
  placeId: idField,
  profile: placeProfileSchema,
  operatingStatus: z.enum(OPERATING_STATUSES),
});

/** RQ-02 修正: the place's desired profile and operating status. */
export const submitPlaceRevisionFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(submitPlaceRevisionSchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { submitPlaceRevision },
      { parseGeneratedId },
      { profileFieldsOf },
      { placeIdOf },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/application/submitPlaceRevision"),
      import("./validator"),
      import("./shopData"),
      import("./targetIds"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    const application = await submitPlaceRevision({
      container,
      actor,
      input: {
        applicationId: parseGeneratedId(
          container.idGenerator,
          "applicationId",
          data.applicationId,
        ),
        placeId: placeIdOf(data.placeId),
        profile: profileFieldsOf(data.profile),
        operatingStatus: data.operatingStatus,
      },
    });
    return { applicationId: application.id };
  });

const claimTargetSchema = z.union([
  z.object({ placeId: idField }),
  z.object({ registrationId: idField }),
]);

export const submitStewardshipSchema = claimSchema.extend({
  applicationId: idField,
  target: claimTargetSchema,
});

/** RQ-03: a claim on a place, or a reapplication for the claim filed with a registration. */
export const submitStewardshipClaimFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(submitStewardshipSchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { submitStewardshipClaim },
      { parseGeneratedId },
      { placeIdOf },
      { applicationIdOf },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/application/submitStewardshipClaim"),
      import("./validator"),
      import("./targetIds"),
      import("./applyData"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    const application = await submitStewardshipClaim({
      container,
      actor,
      input: {
        applicationId: parseGeneratedId(
          container.idGenerator,
          "applicationId",
          data.applicationId,
        ),
        target:
          "placeId" in data.target
            ? { placeId: placeIdOf(data.target.placeId) }
            : { registrationId: applicationIdOf(data.target.registrationId) },
        relationship: data.relationship,
        evidence: data.evidence,
      },
    });
    return { applicationId: application.id };
  });

export const submitNewListingSchema = z.object({
  applicationId: idField,
  placeId: idField,
  content: listingContentSchema,
});

/** RQ-04 新しい掲載. */
export const submitNewListingFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(submitNewListingSchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { submitNewListing },
      { parseGeneratedId },
      { placeIdOf },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/application/submitNewListing"),
      import("./validator"),
      import("./targetIds"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    const application = await submitNewListing({
      container,
      actor,
      input: {
        applicationId: parseGeneratedId(
          container.idGenerator,
          "applicationId",
          data.applicationId,
        ),
        placeId: placeIdOf(data.placeId),
        content: data.content,
      },
    });
    return { applicationId: application.id };
  });

export const submitListingRevisionSchema = z.object({
  applicationId: idField,
  listingId: idField,
  content: listingContentSchema,
});

/** RQ-04 修正: the listing's whole desired content. */
export const submitListingRevisionFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(submitListingRevisionSchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { submitListingRevision },
      { parseGeneratedId },
      { listingIdOf },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/application/submitListingRevision"),
      import("./validator"),
      import("./targetIds"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    const application = await submitListingRevision({
      container,
      actor,
      input: {
        applicationId: parseGeneratedId(
          container.idGenerator,
          "applicationId",
          data.applicationId,
        ),
        listingId: listingIdOf(data.listingId),
        content: data.content,
      },
    });
    return { applicationId: application.id };
  });

export const previewSubmissionSchema = z.object({
  placeId: idField,
  content: listingContentSchema,
});

/**
 * RQ-04 の見え方の確認 (CM-03 from RQ-04): the entered content as viewers
 * would see it. `NotFoundError` when the place stopped being viewable.
 */
export const previewListingSubmissionFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(previewSubmissionSchema))
  .handler(async ({ data }): Promise<ListingPreviewViews> => {
    const [
      { getContainer },
      { requireActor },
      { previewListingSubmission },
      { placeIdOf },
      { toListingPreviewViews },
      { LocalDate },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/application/previewListingSubmission"),
      import("./targetIds"),
      import("./detailView"),
      import("@repo/core/domain/common/localDate"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    const view = await previewListingSubmission({
      container,
      actor,
      input: { placeId: placeIdOf(data.placeId), content: data.content },
    });
    return toListingPreviewViews(
      "preview",
      view.preview,
      view.category?.name ?? null,
      view.photoRefs,
      LocalDate.fromInstant(container.clock.now()),
    );
  });

const resubmissionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("registration"), profile: placeProfileSchema }),
  z.object({
    kind: z.literal("revision"),
    profile: placeProfileSchema,
    operatingStatus: z.enum(OPERATING_STATUSES),
  }),
  claimSchema.extend({ kind: z.literal("stewardship") }),
  z.object({ kind: z.literal("listing"), content: listingContentSchema }),
  z.object({
    kind: z.literal("listingRevision"),
    content: listingContentSchema,
  }),
  z.object({ kind: z.enum(["affiliation", "leave"]) }),
  z.object({
    kind: z.literal("participation"),
    listingIds: z.array(idField).max(100, "掲載は100件までです"),
    dates: z
      .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付を選んでください"))
      .max(400, "参加日が多すぎます"),
  }),
]);

export type ResubmissionValues = z.infer<typeof resubmissionSchema>;

export const resubmitSchema = z.object({
  applicationId: idField,
  version: z.number().int().min(0),
  amended: resubmissionSchema,
  reply: z
    .string()
    .max(4000, "回答は4000文字以内で入力してください")
    .nullable(),
});

/** What a resubmission came to: back under review, or lapsed with the premises that broke. */
export type ResubmitOutcome =
  | Readonly<{ outcome: "resubmitted" }>
  | Readonly<{ outcome: "lapsed"; brokenPremises: readonly string[] }>;

/** RQ-02〜RQ-06 再提出. */
export const resubmitApplicationFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(resubmitSchema))
  .handler(async ({ data }): Promise<ResubmitOutcome> => {
    const [
      { getContainer },
      { requireActor },
      { resubmitApplication },
      { profileFieldsOf },
      { applicationIdOf },
      { Version },
      { listingIdOf },
      { LocalDate },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/application/resubmitApplication"),
      import("./shopData"),
      import("./applyData"),
      import("@repo/core/domain/common/version"),
      import("./targetIds"),
      import("@repo/core/domain/common/localDate"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    const { amended } = data;
    const result = await resubmitApplication({
      container,
      actor,
      input: {
        applicationId: applicationIdOf(data.applicationId),
        version: Version.create(data.version),
        amended:
          amended.kind === "registration"
            ? {
                kind: "registration",
                profile: profileFieldsOf(amended.profile),
              }
            : amended.kind === "revision"
              ? {
                  kind: "revision",
                  profile: profileFieldsOf(amended.profile),
                  operatingStatus: amended.operatingStatus,
                }
              : amended.kind === "participation"
                ? {
                    kind: "participation",
                    listingIds: amended.listingIds.map(listingIdOf),
                    dates: amended.dates.map((date) => LocalDate.parse(date)),
                  }
                : amended,
        reply: data.reply,
      },
    });
    return result.outcome === "resubmitted"
      ? { outcome: "resubmitted" }
      : { outcome: "lapsed", brokenPremises: [...result.brokenPremises] };
  });

/**
 * The active categories, read again when a submission found its category
 * retired (CS-08): the form keeps its input and offers these to re-pick.
 */
export const listActiveCategoriesFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async (): Promise<readonly CategoryOption[]> => {
    const { loadCategoryOptions } = await import("./listingData");
    return loadCategoryOptions();
  });

export const eligibilityTargetSchema = z.union([
  z.object({
    kind: z.enum(["revision", "stewardship", "listing"]),
    placeId: idField,
  }),
  z.object({ kind: z.literal("listingRevision"), listingId: idField }),
  z.object({ kind: z.literal("stewardship"), registrationId: idField }),
]);

export type EligibilityTarget = z.infer<typeof eligibilityTargetSchema>;

/**
 * The refusal a submission met, read afresh (「受け付けない事情」): the
 * screen asks after a submission is refused for a reason of the table, so
 * it can show the destinations — the active application's MY-05 among
 * them. `null` when the submission would now be accepted.
 */
export const checkEligibilityFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(eligibilityTargetSchema))
  .handler(async ({ data }): Promise<ApplyRefusal | null> => {
    const { eligibilityRefusal } = await import("./applyData");
    return eligibilityRefusal(data);
  });
