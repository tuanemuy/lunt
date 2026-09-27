import { createFileRoute } from "@tanstack/react-router";

/**
 * MY-02: where the provider sends the browser back. Logs in and returns to
 * the path kept at the start, or back to MY-02 with the failure shown.
 */
export const Route = createFileRoute(
  "/_account/login/external/$provider/callback",
)({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { completeExternalLogin } = await import(
          "@/presentation/externalLogin"
        );
        return completeExternalLogin(request, params.provider);
      },
    },
  },
});
