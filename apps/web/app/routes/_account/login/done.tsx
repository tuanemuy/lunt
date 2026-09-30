import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { LoginDone } from "@/components/account/LoginDone";

const searchSchema = z.object({
  next: z.string().max(2048).optional().catch(undefined),
});

/**
 * MY-02: where a login the server finished (the external account's
 * callback) lands, to merge the device saves before going on to `next`.
 */
export const Route = createFileRoute("/_account/login/done")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "ログイン — Lunt" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LoginDonePage,
});

function LoginDonePage() {
  const { next } = Route.useSearch();
  return <LoginDone next={next} />;
}
