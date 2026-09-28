import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { errorResponseMiddleware } from "./errorResponseMiddleware";
import { validateInput } from "./validator";

/**
 * Development tool (`/__dev/stewards`): give a store a steward, standing
 * in for the stewardship-claim approval that arrives with S2B.
 */
export const devAppointPlaceStewardFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(
    validateInput(
      z.object({
        placeId: z.string().trim().min(1).max(64),
        email: z.string().trim().min(1).max(254),
      }),
    ),
  )
  .handler(async ({ data }) => {
    const [{ getContainer }, { devAppointPlaceSteward }] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("@repo/core/application/dev/devAppointPlaceSteward"),
    ]);
    const container = await getContainer();
    await devAppointPlaceSteward({ container, input: data });
  });
