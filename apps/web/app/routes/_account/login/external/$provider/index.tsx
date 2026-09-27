import { createFileRoute } from "@tanstack/react-router";

/**
 * MY-02: starts an external login (`?next=` is kept for after it). The
 * browser leaves for the provider's screen; nothing renders here.
 */
export const Route = createFileRoute("/_account/login/external/$provider/")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { startExternalLogin } = await import(
          "@/presentation/externalLogin"
        );
        return startExternalLogin(request, params.provider);
      },
    },
  },
});
