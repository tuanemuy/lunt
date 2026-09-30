import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { errorResponseMiddleware } from "@/presentation/errorResponseMiddleware";

/**
 * VW-10: signed out, nothing to read here — the browser lists its device
 * saves; signed in, the account's first page as an RSC payload, returned
 * unresolved so it streams in under the skeleton.
 */
export const renderSaved = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const [{ isSignedIn }, { SavedAccountContent }] = await Promise.all([
      import("@/presentation/bookmarkData"),
      import("@/components/bookmark/SavedAccountContent"),
    ]);
    if (!(await isSignedIn())) return { signedIn: false as const };
    return {
      signedIn: true as const,
      Saved: renderServerComponent(<SavedAccountContent />),
    };
  });
