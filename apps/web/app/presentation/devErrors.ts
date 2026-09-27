import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { errorResponseMiddleware } from "./errorResponseMiddleware";
import { validateInput } from "./validator";

export const DEV_ERROR_KINDS = [
  "notFound",
  "system",
  "forbidden",
  "unauthorized",
  "conflict",
  "business",
] as const;

export type DevErrorKind = (typeof DEV_ERROR_KINDS)[number];

/**
 * Development tool: fails the way a loader can fail, so each common state
 * (CS-02 / CS-04 / CS-05 / CS-06 / CS-07 / CS-08) can be seen on a screen.
 */
export const devFailFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(z.object({ kind: z.enum(DEV_ERROR_KINDS) })))
  .handler(async ({ data }): Promise<never> => {
    const [{ getContainer }, errors, { BusinessRuleError }] = await Promise.all(
      [
        import("@repo/core/application/di/containerStore"),
        import("@repo/core/application/errors"),
        import("@repo/core/domain/error"),
      ],
    );
    const container = await getContainer();
    if (!container.runtime.devTools) {
      throw new errors.ForbiddenError(
        "DEV_TOOLS_DISABLED",
        "Development tools are disabled",
      );
    }
    switch (data.kind) {
      case "notFound":
        throw new errors.NotFoundError("NOT_FOUND", "No such target");
      case "system":
        throw new errors.SystemError(
          errors.SystemErrorCode.DatabaseError,
          "Simulated storage failure",
        );
      case "forbidden":
        throw new errors.ForbiddenError("FORBIDDEN", "Not allowed");
      case "unauthorized":
        throw new errors.UnauthorizedError("LOGIN_REQUIRED", "Login required");
      case "conflict":
        throw new errors.ConflictError(
          "OPTIMISTIC_LOCK_FAILURE",
          "Simulated conflict",
        );
      case "business":
        throw new BusinessRuleError(
          "COMMON_PUBLICATION_INVALID_TRANSITION",
          "Simulated premise change",
        );
    }
  });
