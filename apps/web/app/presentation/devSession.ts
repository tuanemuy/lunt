import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { errorResponseMiddleware } from "./errorResponseMiddleware";
import { safeNextPath } from "./nextPath";
import { validateInput } from "./validator";

export const devSignInSchema = z.object({
  email: z.string().trim().min(1, "メールアドレスを入力してください").max(254),
  next: z.string().max(2048).optional(),
});

/**
 * Development tool (design.md D-07): log in as the account of `email`,
 * creating it when absent, and answer the path to return to.
 */
export const devSignInFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(devSignInSchema))
  .handler(async ({ data }) => {
    const [{ getContainer }, { devSignIn }, { startSession }] =
      await Promise.all([
        import("@repo/core/application/di/containerStore"),
        import("@repo/core/application/dev/devSignIn"),
        import("./actor"),
      ]);
    const container = await getContainer();
    const { accountId } = await devSignIn({
      container,
      input: { email: data.email },
    });
    await startSession(container, accountId);
    return { next: safeNextPath(data.next) };
  });

/** Development tool: forget this browser's login. */
export const devSignOutFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const [{ getContainer }, { endSession }] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
    ]);
    const container = await getContainer();
    if (!container.runtime.devTools) {
      const { ForbiddenError } = await import("@repo/core/application/errors");
      throw new ForbiddenError(
        "DEV_TOOLS_DISABLED",
        "Development tools are disabled",
      );
    }
    endSession(container);
    return null;
  });

/**
 * Development tool: the logged-in account with its email address, for
 * the session page. `UnauthorizedError` (CS-04) when not logged in.
 */
export const devWhoAmIFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const [{ getContainer }, { requireActor }, { devDescribeAccount }] =
      await Promise.all([
        import("@repo/core/application/di/containerStore"),
        import("./actor"),
        import("@repo/core/application/dev/devSignIn"),
      ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    const account = await devDescribeAccount({
      container,
      input: { accountId: actor.accountId },
    });
    return {
      accountId: actor.accountId as string,
      email: (account?.email ?? null) as string | null,
    };
  });
