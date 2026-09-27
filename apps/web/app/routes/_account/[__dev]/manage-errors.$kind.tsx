import { createFileRoute } from "@tanstack/react-router";
import { DEV_ERROR_KINDS, devFailFn } from "@/presentation/devErrors";
import { requireDevTools } from "@/presentation/devTools";

/**
 * Development tool: the same failures inside a management shell, where a
 * missing target reads as CS-17 (`/__dev/manage-errors/notFound`).
 */
export const Route = createFileRoute("/_account/__dev/manage-errors/$kind")({
  beforeLoad: () => requireDevTools(),
  loader: ({ params }) => {
    const kind = DEV_ERROR_KINDS.find((candidate) => candidate === params.kind);
    return devFailFn({ data: { kind: kind ?? "notFound" } });
  },
  component: () => null,
});
