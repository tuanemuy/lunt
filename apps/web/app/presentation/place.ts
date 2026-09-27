import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { errorResponseMiddleware } from "./errorResponseMiddleware";
import { OPERATING_STATUSES, type PlaceFrame } from "./placeView";
import { validateInput } from "./validator";

const idField = z.string().min(1).max(64);

export const placeRefSchema = z.object({ placeId: idField });

/**
 * The SM screens' guard and frame (`beforeLoad` of `/manage/places/$placeId`):
 * the store and whether the viewer manages it as its steward or as the
 * operator standing in for an absent one. Anyone else — including an
 * operator while the store has a steward — gets `ForbiddenError` (CS-05);
 * an unknown store `NotFoundError` (CS-17).
 */
export const loadPlaceFrameFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(placeRefSchema))
  .handler(async ({ data }): Promise<PlaceFrame> => {
    const [{ getContainer }, { requireActor }, { loadPlaceFrame }] =
      await Promise.all([
        import("@repo/core/application/di/containerStore"),
        import("./actor"),
        import("./shopData"),
      ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    return loadPlaceFrame(container, actor, data.placeId);
  });

const optionalText = (max: number) =>
  z.string().max(max, `${max}文字以内で入力してください`).nullable();

export const placeProfileSchema = z.object({
  name: z.string().max(200, "店舗名は200文字以内で入力してください"),
  photoIds: z.array(idField).max(20, "写真は20枚までです"),
  description: optionalText(4000),
  town: z.object({
    areaCode: z.string().max(16),
    municipalityCode: z.string().max(16),
    name: z.string().max(200),
  }),
  addressRest: z.string().max(200, "町域より後は200文字以内で入力してください"),
  location: z.object({
    latitude: z
      .number()
      .min(-90, "緯度は-90〜90の数で入力してください")
      .max(90, "緯度は-90〜90の数で入力してください"),
    longitude: z
      .number()
      .min(-180, "経度は-180〜180の数で入力してください")
      .max(180, "経度は-180〜180の数で入力してください"),
  }),
  businessHours: optionalText(500),
  contact: optionalText(500),
});

export type PlaceProfileInput = z.infer<typeof placeProfileSchema>;

export const registerPlaceSchema = z.object({
  placeId: idField,
  profile: placeProfileSchema,
});

/** The proxy registration (SHP-12): an operator registers a store without an application. */
export const registerPlaceByProxyFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(registerPlaceSchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { registerPlaceByProxy },
      { parseGeneratedId },
      { profileFieldsOf },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/place/registerPlaceByProxy"),
      import("./validator"),
      import("./shopData"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    const place = await registerPlaceByProxy({
      container,
      actor,
      input: {
        placeId: parseGeneratedId(
          container.idGenerator,
          "placeId",
          data.placeId,
        ),
        profile: profileFieldsOf(data.profile),
      },
    });
    return { placeId: place.id, name: place.profile.name };
  });

export const updatePlaceSchema = z.object({
  placeId: idField,
  version: z.number().int().min(0),
  profile: placeProfileSchema,
});

/** SM-02: saves the store's whole profile (SHP-06, SHP-13). */
export const updatePlaceProfileFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(updatePlaceSchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { updatePlaceProfile },
      { profileFieldsOf },
      { placeIdOf },
      { Version },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/place/updatePlaceProfile"),
      import("./shopData"),
      import("./targetIds"),
      import("@repo/core/domain/common/version"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    const place = await updatePlaceProfile({
      container,
      actor,
      input: {
        placeId: placeIdOf(data.placeId),
        version: Version.create(data.version),
        profile: profileFieldsOf(data.profile),
      },
    });
    return { version: place.version };
  });

export const changeOperatingStatusSchema = z.object({
  placeId: idField,
  version: z.number().int().min(0),
  status: z.enum(OPERATING_STATUSES),
});

/** SM-02: sets the operating status, separately from the profile (SHP-07). */
export const changeOperatingStatusFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(changeOperatingStatusSchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { changeOperatingStatus },
      { placeIdOf },
      { Version },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/place/changeOperatingStatus"),
      import("./targetIds"),
      import("@repo/core/domain/common/version"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    const place = await changeOperatingStatus({
      container,
      actor,
      input: {
        placeId: placeIdOf(data.placeId),
        version: Version.create(data.version),
        status: data.status,
      },
    });
    return { operatingStatus: place.operatingStatus };
  });

/** OM-03: suspends a store (MOD-08, MOD-09). */
export const suspendPlaceFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(placeRefSchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { suspendPlace },
      { placeIdOf },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/place/suspendPlace"),
      import("./targetIds"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    await suspendPlace({
      container,
      actor,
      input: { placeId: placeIdOf(data.placeId) },
    });
    return null;
  });

/** OM-03: lifts a store's suspension. */
export const unsuspendPlaceFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(placeRefSchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { unsuspendPlace },
      { placeIdOf },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/place/unsuspendPlace"),
      import("./targetIds"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    await unsuspendPlace({
      container,
      actor,
      input: { placeId: placeIdOf(data.placeId) },
    });
    return null;
  });
