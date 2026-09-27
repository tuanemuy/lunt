import { createFileRoute } from "@tanstack/react-router";
import { DEV_ERROR_KINDS, devFailFn } from "@/presentation/devErrors";
import { requireDevTools } from "@/presentation/devTools";

/**
 * Development tool: a viewer-area page whose loader fails with the error
 * named in the URL, to see the common state it becomes
 * (`/__dev/errors/system` → CS-02, `/__dev/errors/notFound` → CS-06, …).
 */
export const Route = createFileRoute("/__dev/errors/$kind")({
  beforeLoad: () => requireDevTools(),
  loader: ({ params }) => {
    const kind = DEV_ERROR_KINDS.find((candidate) => candidate === params.kind);
    return devFailFn({ data: { kind: kind ?? "notFound" } });
  },
  component: () => null,
});
