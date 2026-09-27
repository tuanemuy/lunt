import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { errorResponseMiddleware } from "./errorResponseMiddleware";
import type { AreaOption, TownOption } from "./placeView";
import { validateInput } from "./validator";

/**
 * CF-07's lookups for the address fields (SM-02 and the proxy
 * registration). None needs a login; the codes' formats are the value
 * objects' to check (`AREA_INVALID_*`).
 */

export const findTownsSchema = z.object({
  postalCode: z
    .string()
    .trim()
    .min(1, "郵便番号を入力してください")
    .max(16, "郵便番号は7桁の数字で入力してください"),
});

/** The towns of a typed postal code (`AREA_TOWN_NOT_FOUND` when none). */
export const findTownsFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(findTownsSchema))
  .handler(async ({ data }): Promise<readonly TownOption[]> => {
    const [{ getContainer }, { findTownsByPostalCode }, { toTownOption }] =
      await Promise.all([
        import("@repo/core/application/di/containerStore"),
        import("@repo/core/application/area/findTownsByPostalCode"),
        import("./areaData"),
      ]);
    const towns = await findTownsByPostalCode({
      container: await getContainer(),
      input: { postalCode: data.postalCode },
    });
    return towns.map(toTownOption);
  });

export const browseAreaSchema = z.discriminatedUnion("level", [
  z.object({
    level: z.literal("municipalities"),
    prefectureCode: z.string().max(8),
  }),
  z.object({ level: z.literal("towns"), municipalityCode: z.string().max(8) }),
]);

export type BrowsedArea =
  | Readonly<{ level: "municipalities"; items: readonly AreaOption[] }>
  | Readonly<{ level: "towns"; items: readonly TownOption[] }>;

/** One level below a picked prefecture or municipality. */
export const browseAreaFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(browseAreaSchema))
  .handler(async ({ data }): Promise<BrowsedArea> => {
    const [{ getContainer }, { browseAreaHierarchy }, { toTownOption }] =
      await Promise.all([
        import("@repo/core/application/di/containerStore"),
        import("@repo/core/application/area/browseAreaHierarchy"),
        import("./areaData"),
      ]);
    const container = await getContainer();
    const result = await browseAreaHierarchy({ container, input: data });
    switch (result.level) {
      case "prefectures":
        return { level: "municipalities", items: [] };
      case "municipalities":
        return {
          level: "municipalities",
          items: result.municipalities.map(({ code, name }) => ({
            code,
            name,
          })),
        };
      case "towns":
        return { level: "towns", items: result.towns.map(toTownOption) };
    }
  });
