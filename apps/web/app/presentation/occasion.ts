import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { errorResponseMiddleware } from "./errorResponseMiddleware";
import type {
  CandidatePage,
  OccasionFrame,
  ParticipantItem,
} from "./occasionView";
import { validateInput } from "./validator";

/**
 * The event management area's server functions (EM-01〜03, EM-02 新規,
 * CM-04). Server-only reads live in `occasionData.ts`.
 */

const idField = z.string().min(1).max(64);
const dayField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日付を選んでください");

export const occasionRefSchema = z.object({ occasionId: idField });

const occasionFrameSchema = occasionRefSchema.extend({
  /** The screen's path, so a missing store it is about wins over a refusal. */
  path: z.string().max(2048).optional(),
});

/**
 * The EM screens' guard and frame (`beforeLoad` of
 * `/manage/events/$occasionId`): the event and whether the viewer manages
 * it as its event operator or as the operator standing in for an absent
 * one. Anyone else — including an operator while the event has an event
 * operator — gets `ForbiddenError` (CS-05 / CS-15); an unknown event, or
 * an unknown store the screen at `path` is about (CM-04), `NotFoundError`
 * (CS-17) first.
 */
export const loadOccasionFrameFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(occasionFrameSchema))
  .handler(async ({ data }): Promise<OccasionFrame> => {
    const [{ getContainer }, { requireActor }, { loadOccasionFrame }] =
      await Promise.all([
        import("@repo/core/application/di/containerStore"),
        import("./actor"),
        import("./occasionData"),
      ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    return loadOccasionFrame(
      container,
      actor,
      data.occasionId,
      data.path ?? null,
    );
  });

const optionalText = (max: number) =>
  z.string().max(max, `${max}文字以内で入力してください`).nullable();

export const occasionContentSchema = z.object({
  name: optionalText(200),
  period: z.object({ start: dayField, end: dayField }).nullable(),
  address: z
    .object({
      town: z.object({
        areaCode: z.string().max(16),
        municipalityCode: z.string().max(16),
        name: z.string().max(200),
      }),
      rest: z.string().max(200, "町域より後は200文字以内で入力してください"),
    })
    .nullable(),
  location: z
    .object({
      latitude: z
        .number()
        .min(-90, "緯度は-90〜90の数で入力してください")
        .max(90, "緯度は-90〜90の数で入力してください"),
      longitude: z
        .number()
        .min(-180, "経度は-180〜180の数で入力してください")
        .max(180, "経度は-180〜180の数で入力してください"),
    })
    .nullable(),
  photoIds: z.array(idField).max(20, "写真は20枚までです"),
  description: optionalText(4000),
  tagline: optionalText(200),
});

export type OccasionContentInput = z.infer<typeof occasionContentSchema>;

export const registerOccasionSchema = z.object({
  occasionId: idField,
  content: occasionContentSchema,
});

/** EM-02 新規 (EVT-12): an operator registers a draft event; idempotent on the minted id. */
export const registerOccasionFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(registerOccasionSchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { registerOccasion },
      { parseGeneratedId },
      { occasionFieldsOf },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/occasion/registerOccasion"),
      import("./validator"),
      import("./occasionFields"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    const view = await registerOccasion({
      container,
      actor,
      input: {
        occasionId: parseGeneratedId(
          container.idGenerator,
          "occasionId",
          data.occasionId,
        ),
        content: occasionFieldsOf(data.content),
      },
    });
    return { occasionId: view.id };
  });

export const updateOccasionSchema = z.object({
  occasionId: idField,
  version: z.number().int().min(0),
  content: occasionContentSchema,
});

/** EM-02: saves the event's whole content (EVT-04, EVT-13). */
export const updateOccasionContentFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(updateOccasionSchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { updateOccasionContent },
      { occasionFieldsOf },
      { occasionIdOf },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/occasion/updateOccasionContent"),
      import("./occasionFields"),
      import("./occasionData"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    const view = await updateOccasionContent({
      container,
      actor,
      input: {
        occasionId: occasionIdOf(data.occasionId),
        version: data.version,
        content: occasionFieldsOf(data.content),
      },
    });
    return { version: view.version as number };
  });

export const OCCASION_TRANSITIONS = [
  "publish",
  "unpublish",
  "cancel",
  "revokeCancellation",
] as const;
export type OccasionTransition = (typeof OCCASION_TRANSITIONS)[number];

export const transitionOccasionSchema = z.object({
  occasionId: idField,
  transition: z.enum(OCCASION_TRANSITIONS),
});

/** EM-02: publish, unpublish (CF-08), cancel and revoke the cancellation (EVT-06, EVT-11). */
export const transitionOccasionFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(transitionOccasionSchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { occasionIdOf },
      publish,
      unpublish,
      cancel,
      revoke,
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("./occasionData"),
      import("@repo/core/application/occasion/publishOccasion"),
      import("@repo/core/application/occasion/unpublishOccasion"),
      import("@repo/core/application/occasion/cancelOccasion"),
      import("@repo/core/application/occasion/revokeOccasionCancellation"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    const args = {
      container,
      actor,
      input: { occasionId: occasionIdOf(data.occasionId) },
    };
    const view = await (() => {
      switch (data.transition) {
        case "publish":
          return publish.publishOccasion(args);
        case "unpublish":
          return unpublish.unpublishOccasion(args);
        case "cancel":
          return cancel.cancelOccasion(args);
        case "revokeCancellation":
          return revoke.revokeOccasionCancellation(args);
      }
    })();
    return { version: view.version as number };
  });

export const participantPageSchema = z.object({
  occasionId: idField,
  page: z.number().int().min(1).max(10000),
});

/** EM-01: the next page of participants (CF-05). */
export const listParticipantsFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(participantPageSchema))
  .handler(
    async ({
      data,
    }): Promise<
      Readonly<{ items: readonly ParticipantItem[]; count: number }>
    > => {
      const { loadParticipantPage } = await import("./occasionData");
      return loadParticipantPage(data.occasionId, data.page);
    },
  );

export const participationRefSchema = z.object({
  occasionId: idField,
  placeId: idField,
});

/** EM-01: excludes a participant (EVT-09). */
export const excludeParticipantFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(participationRefSchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { excludeParticipant },
      { occasionIdOf },
      { PlaceId },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/occasion/excludeParticipant"),
      import("./occasionData"),
      import("@repo/core/domain/common/ids"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    await excludeParticipant({
      container,
      actor,
      input: {
        occasionId: occasionIdOf(data.occasionId),
        placeId: PlaceId.create(data.placeId),
      },
    });
    return null;
  });

export const regionLinkSchema = z.object({
  occasionId: idField,
  regionId: idField,
});

/** EM-03: links a published region (EVT-05). */
export const linkRegionFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(regionLinkSchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { linkRegion },
      { occasionIdOf },
      { RegionId },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/occasion/linkRegion"),
      import("./occasionData"),
      import("@repo/core/domain/common/ids"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    await linkRegion({
      container,
      actor,
      input: {
        occasionId: occasionIdOf(data.occasionId),
        regionId: RegionId.create(data.regionId),
      },
    });
    return null;
  });

/** EM-03: removes a linked region (EVT-05). */
export const unlinkRegionFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(regionLinkSchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { unlinkRegion },
      { occasionIdOf },
      { RegionId },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/occasion/unlinkRegion"),
      import("./occasionData"),
      import("@repo/core/domain/common/ids"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    await unlinkRegion({
      container,
      actor,
      input: {
        occasionId: occasionIdOf(data.occasionId),
        regionId: RegionId.create(data.regionId),
      },
    });
    return null;
  });

export const candidateSearchSchema = z.object({
  occasionId: idField,
  keyword: z.string().max(100, "キーワードは100文字以内で入力してください"),
});

/** EM-03 CF-02: published regions to link. */
export const findRegionCandidatesFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(candidateSearchSchema))
  .handler(async ({ data }): Promise<CandidatePage> => {
    const { findRegionCandidates } = await import("./occasionData");
    return findRegionCandidates(data.occasionId, data.keyword);
  });

/** CM-04 追加 CF-02: viewable places without a steward. */
export const findPlaceCandidatesFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(candidateSearchSchema))
  .handler(async ({ data }): Promise<CandidatePage> => {
    const { findPlaceCandidates } = await import("./occasionData");
    return findPlaceCandidates(data.occasionId, data.keyword);
  });

const detailsFields = {
  listingIds: z.array(idField).max(100, "掲載は100件までです"),
  dates: z.array(dayField).max(400, "参加日が多すぎます"),
};

export const saveParticipationSchema = participationRefSchema.extend({
  side: z.enum(["place", "occasion"]),
  version: z.number().int().min(0),
  ...detailsFields,
});

/**
 * CM-04: saves a participation's listings and dates, as the place's
 * steward (EVT-02) or as the event's operator for a place without a
 * steward (EVT-10).
 */
export const saveParticipationFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(saveParticipationSchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      byPlace,
      byOccasion,
      { participationFieldsOf },
      { Version },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/occasion/changeParticipationByPlace"),
      import("@repo/core/application/occasion/changeParticipationByOccasion"),
      import("./occasionFields"),
      import("@repo/core/domain/common/version"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    const input = {
      ...participationFieldsOf(data),
      version: Version.create(data.version),
    };
    const view =
      data.side === "place"
        ? await byPlace.changeParticipationByPlace({ container, actor, input })
        : await byOccasion.changeParticipationByOccasion({
            container,
            actor,
            input,
          });
    return { version: view.version as number };
  });

export const addParticipationSchema =
  participationRefSchema.extend(detailsFields);

/** CM-04 追加: the event's operator adds a place without a steward (EVT-10). */
export const addParticipationFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(addParticipationSchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { addParticipationDirectly },
      { participationFieldsOf },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/occasion/addParticipationDirectly"),
      import("./occasionFields"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    await addParticipationDirectly({
      container,
      actor,
      input: participationFieldsOf(data),
    });
    return null;
  });

/** CM-04: the place's steward withdraws from the event (EVT-03). */
export const withdrawParticipationFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(participationRefSchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { withdrawParticipation },
      { occasionIdOf },
      { PlaceId },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/occasion/withdrawParticipation"),
      import("./occasionData"),
      import("@repo/core/domain/common/ids"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    await withdrawParticipation({
      container,
      actor,
      input: {
        occasionId: occasionIdOf(data.occasionId),
        placeId: PlaceId.create(data.placeId),
      },
    });
    return null;
  });
