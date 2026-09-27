import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { errorResponseMiddleware } from "./errorResponseMiddleware";

/** What the browser may know about who is logged in. */
export type SessionView = Readonly<{ accountId: string }> | null;

/**
 * The logged-in account of this request (the `Actor` boundary), or
 * `null` — including when the session belongs to a withdrawn account.
 */
export const loadSession = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async (): Promise<SessionView> => {
    const [{ getContainer }, { resolveActor }] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
    ]);
    const actor = await resolveActor(await getContainer());
    return actor === null ? null : { accountId: actor.accountId };
  });

/**
 * `beforeLoad` guard of screens that need a login (CS-04): sends a
 * visitor who is not logged in to MY-02 with the current location as
 * the return path, and returns the session otherwise.
 */
export async function requireLogin(location: {
  href: string;
}): Promise<NonNullable<SessionView>> {
  const session = await loadSession();
  if (session === null) {
    throw redirect({ to: "/login", search: { next: location.href } });
  }
  return session;
}
